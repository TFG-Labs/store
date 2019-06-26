import PropTypes from 'prop-types'
import React, { useMemo, useReducer, useEffect } from 'react'
import { last, head, path, propEq, find } from 'ramda'
import { Helmet, useRuntime } from 'vtex.render-runtime'
import { ProductOpenGraph } from 'vtex.open-graph'
import { ProductContext as ProductContextApp } from 'vtex.product-context'
import { ProductDispatchContext } from 'vtex.product-context/ProductDispatchContext'

import StructuredData from './components/StructuredData'

import useDataPixel from './hooks/useDataPixel'

function reducer(state, action) {
  const args = action.args || {}
  switch (action.type) {
    case 'SET_QUANTITY':
      return {
        ...state,
        selectedQuantity: args.quantity,
      }
    case 'SKU_SELECTOR_SET_VARIATIONS_SELECTED': {
      return {
        ...state,
        skuSelector: {
          ...state.skuSelector,
          areAllVariationsSelected: args.allSelected,
        },
      }
    }
    case 'SET_SELECTED_ITEM': {
      return {
        ...state,
        selectedItem: findItemById(args.id)(state.product.items),
      }
    }
    default:
      return state
  }
}

const findItemById = id => find(propEq('itemId', id))
function findAvailableProduct(item) {
  return item.sellers.find(
    ({ commertialOffer = {} }) => commertialOffer.AvailableQuantity > 0
  )
}

function getSelectedItem(query, items) {
  return query.skuId
    ? findItemById(query.skuId)(items)
    : items.find(findAvailableProduct) || items[0]
}

function useSelectedItemFromId(skuId, dispatch, selectedItem) {
  useEffect(() => {
    if (skuId && selectedItem && selectedItem.itemId !== skuId) {
      dispatch({
        type: 'SET_SELECTED_ITEM',
        args: { id: skuId },
      })
    }
  }, [dispatch, selectedItem, skuId])
}

const ProductWrapper = ({
  params: { slug },
  productQuery,
  productQuery: { product, loading } = {},
  query,
  children,
  ...props
}) => {
  const { account } = useRuntime()
  const items = path(['items'], product) || []

  const [state, dispatch] = useReducer(reducer, {
    selectedItem: getSelectedItem(query, items),
    product,
    categories: path(['categories'], product),
    selectedQuantity: 1,
    skuSelector: {
      areAllVariationsSelected: false,
    },
  })
  useSelectedItemFromId(query.skuId, dispatch, state.selectedItem)

  const pixelEvents = useMemo(() => {
    const {
      titleTag,
      brand,
      categoryId,
      categoryTree,
      productId,
      productName,
      items,
    } = product || {}

    if (!product || typeof document === 'undefined') {
      return []
    }

    const pageInfo = {
      event: 'pageInfo',
      eventType: 'productView',
      accountName: account,
      pageCategory: 'Product',
      pageDepartment: categoryTree ? head(categoryTree).name : '',
      pageFacets: [],
      pageTitle: titleTag,
      pageUrl: window.location.href,
      productBrandName: brand,
      productCategoryId: Number(categoryId),
      productCategoryName: categoryTree ? last(categoryTree).name : '',
      productDepartmentId: categoryTree ? head(categoryTree).id : '',
      productDepartmentName: categoryTree ? head(categoryTree).name : '',
      productId: productId,
      productName: productName,
      skuStockOutFromProductDetail: [],
      skuStockOutFromShelf: [],
    }

    const skuId = query.skuId || (items && head(items).itemId)

    const [sku] =
      (items && items.filter(product => product.itemId === skuId)) || []

    const { ean, referenceId, sellers } = sku || {}

    pageInfo.productEans = [ean]

    if (referenceId && referenceId.length >= 0) {
      const [{ Value: refIdValue }] = referenceId

      pageInfo.productReferenceId = refIdValue
    }

    if (sellers && sellers.length >= 0) {
      const [{ commertialOffer, sellerId }] = sellers

      pageInfo.productListPriceFrom = `${commertialOffer.ListPrice}`
      pageInfo.productListPriceTo = `${commertialOffer.ListPrice}`
      pageInfo.productPriceFrom = `${commertialOffer.Price}`
      pageInfo.productPriceTo = `${commertialOffer.Price}`
      pageInfo.sellerId = `${sellerId}`
      pageInfo.sellerIds = `${sellerId}`
    }

    // Add selected SKU property to the product object
    product.selectedSku = query.skuId ? query.skuId : product.items[0].itemId

    return [
      pageInfo,
      {
        event: 'productView',
        product,
      },
    ]
  }, [account, product, query.skuId])

  useDataPixel(pixelEvents, loading)

  const { titleTag, metaTagDescription } = product || {}

  const dispatchValue = useMemo(() => ({ dispatch }), [dispatch])

  const childrenProps = useMemo(
    () => ({
      productQuery,
      slug,
      ...props,
    }),
    [productQuery, slug, props]
  )

  return (
    <div className="vtex-product-context-provider">
      <Helmet
        title={titleTag}
        meta={[
          metaTagDescription && {
            name: 'description',
            content: metaTagDescription,
          },
        ].filter(Boolean)}
      />
      <ProductContextApp.Provider value={state}>
        <ProductDispatchContext.Provider value={dispatchValue}>
          {product && <ProductOpenGraph />}
          {product && <StructuredData product={product} query={query} />}
          {React.cloneElement(children, childrenProps)}
        </ProductDispatchContext.Provider>
      </ProductContextApp.Provider>
    </div>
  )
}

ProductWrapper.propTypes = {
  params: PropTypes.object,
  productQuery: PropTypes.object,
  children: PropTypes.node,
  /* URL query params */
  query: PropTypes.object,
}

export default ProductWrapper
