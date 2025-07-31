'use strict'

// Function to update the badge based on current tab's settings
function updateBadge(tabId) {
	browser.tabs.get(tabId).then(tab => {
		const url = new URL(tab.url)
		const storageKey = url.hostname + url.pathname
		
		browser.storage.local.get([storageKey]).then(result => {
			const pageSettings = result[storageKey] || {}
			
			// Check if any settings are applied
			let hasSettings = false
			let gain = 0
			
			// Check all_media settings
			if (pageSettings.all_media) {
				if (pageSettings.all_media.gain !== undefined && pageSettings.all_media.gain !== 0) {
					gain = pageSettings.all_media.gain
					hasSettings = true
				}
				if (pageSettings.all_media.pan !== undefined && pageSettings.all_media.pan !== 0) {
					hasSettings = true
				}
				if (pageSettings.all_media.mono || pageSettings.all_media.flip) {
					hasSettings = true
				}
			}
			
			// Check individual element settings
			for (const key in pageSettings) {
				if (key.startsWith('element_')) {
					const settings = pageSettings[key]
					if (settings.gain !== undefined && settings.gain !== 0) {
						hasSettings = true
						if (Math.abs(settings.gain) > Math.abs(gain)) {
							gain = settings.gain
						}
					}
					if ((settings.pan !== undefined && settings.pan !== 0) || settings.mono || settings.flip) {
						hasSettings = true
					}
				}
			}
			
			// Update badge
			if (gain !== 0) {
				// Show gain value if any gain is applied, otherwise show count
				browser.browserAction.setBadgeText({
					text: gain.toString(),
					tabId: tabId
				})
				browser.browserAction.setBadgeBackgroundColor({
					color: gain > 0 ? '#00ff11' : '#ff0011', // Green for positive gain, red for negative gain
					tabId: tabId
				})
			} else if (hasSettings) {
				// Show count of settings
				browser.browserAction.setBadgeText({
					text: '!',
					tabId: tabId
				})
				browser.browserAction.setBadgeBackgroundColor({
					color: '#0011ff', // Blue for other settings
					tabId: tabId
				})
			} else {
				// Clear badge if no settings
				browser.browserAction.setBadgeText({
					text: '',
					tabId: tabId
				})
			}
		}).catch(err => {
			console.error('Error reading storage for badge:', err)
			// Clear badge on error
			browser.browserAction.setBadgeText({
				text: '',
				tabId: tabId
			})
		})
	}).catch(err => {
		console.error('Error getting tab info for badge:', err)
	})
}

// Listen for messages from popup to update badge immediately
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'updateBadge' && message.tabId) {
		updateBadge(message.tabId)
	}
})

// Listen for storage changes to update badge
browser.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === 'local') {
		// Get current active tab and update its badge
		browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
			if (tabs.length > 0) {
				updateBadge(tabs[0].id)
			}
		}).catch(err => console.error('Error querying tabs for badge update:', err))
	}
})

// Listen for tab updates to update badge when navigating
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		updateBadge(tabId)
	}
})

// Listen for tab activation to update badge when switching tabs
browser.tabs.onActivated.addListener((activeInfo) => {
	updateBadge(activeInfo.tabId)
})

// Initialize badge for current tab when extension starts
browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
	if (tabs.length > 0) {
		updateBadge(tabs[0].id)
	}
}).catch(err => console.error('Error initializing badge:', err))
