'use strict'

// Background script to automatically inject content script on sites with saved settings
console.log('SoundFixerEXTRA: Background script loaded')

// Listen for tab navigation events
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	console.log('SoundFixerEXTRA: Tab updated', { tabId, status: changeInfo.status, url: tab.url })
	// Only act when the page has finished loading
	if (changeInfo.status === 'complete' && tab.url) {
		console.log('SoundFixerEXTRA: Page complete, checking for settings')
		checkAndInjectContentScript(tab.url, tabId)
	}
})

// Also listen for when tabs are activated (switched to)
browser.tabs.onActivated.addListener((activeInfo) => {
	browser.tabs.get(activeInfo.tabId).then(tab => {
		if (tab.url) {
			checkAndInjectContentScript(tab.url, tab.id)
		}
	}).catch(err => console.error('Error getting tab info:', err))
})

function checkAndInjectContentScript(url, tabId) {
	try {
		const urlObj = new URL(url)
		const storageKey = urlObj.hostname + urlObj.pathname
		
		// Check if this site has saved settings
		browser.storage.local.get([storageKey]).then(result => {
			const pageSettings = result[storageKey] || {}
			
			if (Object.keys(pageSettings).length > 0) {
				console.log(`Background: Found saved settings for ${storageKey}, injecting content script`)
				
				// Inject content script for this tab
				browser.tabs.executeScript(tabId, { 
					file: 'content.js',
					runAt: 'document_end'
				}).catch(err => {
					// Ignore errors for protected pages or pages where we don't have permission
					if (!err.message.includes('Missing host permission') && 
						!err.message.includes('Cannot access')) {
						console.error('Error injecting content script:', err)
					}
				})
			}
		}).catch(err => console.error('Error checking storage:', err))
	} catch (err) {
		// Ignore invalid URLs (like about: pages, extensions, etc.)
	}
}

// When extension starts up, check all existing tabs
browser.tabs.query({}).then(tabs => {
	tabs.forEach(tab => {
		if (tab.url && tab.status === 'complete') {
			checkAndInjectContentScript(tab.url, tab.id)
		}
	})
}).catch(err => console.error('Error checking existing tabs:', err))
