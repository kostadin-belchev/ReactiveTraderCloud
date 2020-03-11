import { GlobalState } from 'StoreTypes'
import { createSelector } from 'reselect'

export const selectState = (state: GlobalState) => state.layoutService

export const blotterSelector = createSelector([selectState], state => state.blotter)

export const analyticsSelector = createSelector([selectState], state => state.analytics)

export const spotTilesSelector = createSelector([selectState], state => state.spotTiles)
