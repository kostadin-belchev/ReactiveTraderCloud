import uuid from 'uuid'
import { Glue42 } from '@glue42/desktop'
import { Glue42Core } from '@glue42/core'
import _ from 'lodash'
import { WindowConfig } from '../types'
import { frameButtonBase64 } from './utils/frameButtonImage'
import { CanvasAPI } from './canvas'
import { exportedStore } from 'apps/MainRoute/MainRoute'
import { Direction } from 'rt-types'
import { SpotTileActions } from 'apps/MainRoute/widgets/spotTile/actions'
import { ExecuteTradeRequest } from 'apps/MainRoute/widgets/spotTile/model/executeTradeRequest'

type BrowserWindowProps = WindowConfig
type GDWindow = Glue42.Windows.GDWindow
type RelativeDirection = Glue42.Windows.RelativeDirection
type ButtonInfo = Glue42.Windows.ButtonInfo
type GDObject = Glue42Core.GDObject

let listOfOpenedWindows: GDWindow[] = []

// TODO are there better ways to check?
const isSpot = (url: string) => url.indexOf('spot') >= 0
const isAnalytics = (url: string) => url.indexOf('analytics') >= 0

/**
 * Glue42 has the ability to manage windows. The registered methods here give the ability to demonstrate different
 * functionalities with the opened windows (Activity, Blotter, Spot windows).
 */
export const registerWindowMethods = () => {
  if (isSpot(location.href)) {
    return
  }

  let isCollapsed = false
  window.glue.interop.register('toggleCollapse', async () => {
    for (const wnd of listOfOpenedWindows) {
      isCollapsed ? await wnd.expand() : await wnd.collapse()
    }
    isCollapsed = !isCollapsed
  })

  window.glue.interop.register('stackAllWindows', () => {
    listOfOpenedWindows.forEach(async (wnd, index) => {
      if (index > 0) {
        await wnd.detachTab({
          relativeTo: listOfOpenedWindows[index - 1],
          relativeDirection: 'bottom'
        })
      }
    })
  })

  window.glue.interop.register('tabAllWindows', () => {
    listOfOpenedWindows.forEach(async (wnd, index) => {
      if (index > 0) {
        await listOfOpenedWindows[0].attachTab(wnd, index)
      }
    })
  })

  window.glue.interop.register('openWorkspace', (args: { symbol: string }) => {
    // canvas typings are currently external
    ; (window.glue42gd as GDObject & {
      canvas: CanvasAPI
    }).canvas.openWorkspace('Reactive Trader Workspace', { context: args })
  })

  window.glue.windows.onWindowRemoved((removedWnd: GDWindow) => {
    listOfOpenedWindows = listOfOpenedWindows.filter(wnd => wnd.id !== removedWnd.id)
    window.glue.interop.invoke('toggleHeaderButtons', {
      numberOfOpenedWindows: listOfOpenedWindows.length
    })
  })
}

export const registerGlueMethods = () => {
  interface Trade {
    currencyPair: string // consists of two country-specific three-letter alphabetic code together
    dealtCurrency: string // also called base currency, country-specific three-letter alphabetic code
    direction: 'Buy' | 'Sell'
    notional: number // a whole number
  }

  window.glue.interop.register({
    name: 'T42.OMS.TradeCurrPair',
    accepts: "String currencyPair, String dealtCurrency, String direction, Long notional", // e.g. { currencyPair: 'USDJPY', dealtCurrency: 'USD', direction: 'Buy', notional: 1000000 }
  }, ({ currencyPair, dealtCurrency, direction, notional }: Trade) => {
    window.glue.windows.my().focus()
    if (Object.keys(exportedStore.getState().spotTilesData).includes(currencyPair)) {
      const priceData = exportedStore.getState().spotTilesData[currencyPair]
      const spotRate = direction === Direction.Buy ? priceData.price.ask : priceData.price.bid
      const tradeRequestObj: ExecuteTradeRequest = {
        CurrencyPair: currencyPair,
        DealtCurrency: dealtCurrency,
        Direction: direction === Direction.Buy ? Direction.Buy : Direction.Sell,
        Notional: notional,
        SpotRate: spotRate,
        id: uuid()
      }
      
      exportedStore.dispatch(SpotTileActions.executeTrade(tradeRequestObj, null))
    }
  })
}

export const openGlueWindow = async (config: BrowserWindowProps, onClose?: () => void) => {
  const myWindow: GDWindow = window.glue.windows.my()
  const { name, width, height, url } = config
  const {
    left,
    top,
    modifiedWidth,
    modifiedHeight,
    relativeTo,
    relativeDirection
  } = calculatePosition(myWindow, width, height, url)
  const fullUrl = `${location.origin}${url}`
  const isTabWindow = isSpot(url)

  const win = await window.glue.windows.open(name, fullUrl, {
    title: _.startCase(_.toLower(name)),
    width: Math.round(modifiedWidth),
    height: Math.round(modifiedHeight),
    left: Math.round(left),
    top: Math.round(top),
    relativeTo,
    relativeDirection,
    allowCollapse: false,
    mode: 'tab',
    tabGroupId: isTabWindow ? 'reactiveTraderCloudSpot' : name
  })

  if (isTabWindow) {
    listOfOpenedWindows.push(win)
    window.glue.interop.invoke('toggleHeaderButtons', {
      numberOfOpenedWindows: listOfOpenedWindows.length
    })
  }

  if (win) {
    if (onClose && win.onClose) {
      win.onClose(onClose)
    }
    if (isTabWindow) {
      await win.activate()
    }
    addFrameButton(win)
    return Promise.resolve(win)
  } else {
    return Promise.reject(null)
  }
}

const calculatePosition = (
  myWindow: GDWindow,
  width: number,
  height: number,
  url: string
): {
  left: number
  top: number
  modifiedWidth: number
  modifiedHeight: number
  relativeTo: string
  relativeDirection: RelativeDirection
} => {
  let left = 0
  let top = 0
  let relativeTo = ''
  let relativeDirection: RelativeDirection = 'left'

  if (isSpot(url)) {
    // TODO: remove "!" - this is a temp fix for typings
    left = myWindow.bounds.left! - width - 20
    top = myWindow.bounds.top!
  } else {
    relativeTo = myWindow.id
    if (isAnalytics(url)) {
      relativeDirection = 'right'
    } else {
      height = 260
      width = 1400
      relativeDirection = 'bottom'
    }
  }
  return { left, top, modifiedWidth: width, modifiedHeight: height, relativeTo, relativeDirection }
}

/**
 * Adds a custom frame button for expand/collapse.
 */
const addFrameButton = (win: GDWindow) => {
  win.addFrameButton(
    {
      buttonId: `${win.id}-collapse`,
      order: 2,
      tooltip: 'Collapse',
      imageBase64: frameButtonBase64
    },
    () => {
      win.onFrameButtonClicked((buttonInfo: ButtonInfo, wnd: GDWindow) => {
        if (!wnd.isCollapsed) {
          wnd.collapse()
          return
        }
        wnd.group.windows.forEach((tileWindow: GDWindow) => {
          if (tileWindow.id === wnd.id) {
            wnd.expand()
          } else {
            tileWindow.collapse()
          }
        })
      })
    },
    console.error
  )
}
