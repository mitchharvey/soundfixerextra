'use strict'

// Content script that runs automatically on page load to apply saved audio settings

function applyAudioSettings(settings) {
	// Find all audio/video elements on the page
	const elements = document.querySelectorAll('video, audio')
	
	elements.forEach((el, index) => {
		// Assign unique ID if not already present
		if (!el.hasAttribute('data-x-soundfixer-id')) {
			el.setAttribute('data-x-soundfixer-id', Math.random().toString(36).substr(2, 10))
		}
		
		const elementKey = `element_${index}` // Use element index for stable keys
		
		// Apply settings if they exist for this element
		if (settings[elementKey]) {
			const savedSettings = settings[elementKey]
			console.log(`Auto-applying saved settings to element ${elid}:`, savedSettings)
			
			try {
				// Initialize audio context and nodes if not already done
				if (!el.xSoundFixerContext) {
					el.xSoundFixerContext = new AudioContext()
					el.xSoundFixerGain = el.xSoundFixerContext.createGain()
					el.xSoundFixerPan = el.xSoundFixerContext.createStereoPanner()
					el.xSoundFixerSplit = el.xSoundFixerContext.createChannelSplitter(2)
					el.xSoundFixerMerge = el.xSoundFixerContext.createChannelMerger(2)
					el.xSoundFixerSource = el.xSoundFixerContext.createMediaElementSource(el)
					el.xSoundFixerSource.connect(el.xSoundFixerGain)
					el.xSoundFixerGain.connect(el.xSoundFixerPan)
					el.xSoundFixerPan.connect(el.xSoundFixerContext.destination)
					el.xSoundFixerOriginalChannels = el.xSoundFixerContext.destination.channelCount
				}
				
				// Apply saved settings
				if ('gain' in savedSettings) {
					el.xSoundFixerGain.gain.value = savedSettings.gain
				}
				if ('pan' in savedSettings) {
					el.xSoundFixerPan.pan.value = savedSettings.pan
				}
				if ('mono' in savedSettings) {
					el.xSoundFixerContext.destination.channelCount = savedSettings.mono ? 1 : el.xSoundFixerOriginalChannels
				}
				if ('flip' in savedSettings) {
					el.xSoundFixerFlipped = savedSettings.flip
					el.xSoundFixerMerge.disconnect()
					el.xSoundFixerPan.disconnect()
					if (el.xSoundFixerFlipped) {
						el.xSoundFixerPan.connect(el.xSoundFixerSplit)
						el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 0, 1)
						el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 1, 0)
						el.xSoundFixerMerge.connect(el.xSoundFixerContext.destination)
					} else {
						el.xSoundFixerPan.connect(el.xSoundFixerContext.destination)
					}
				}
				
				// Store current settings on element
				el.xSoundFixerSettings = {
					gain: el.xSoundFixerGain.gain.value,
					pan: el.xSoundFixerPan.pan.value,
					mono: el.xSoundFixerContext.destination.channelCount == 1,
					flip: el.xSoundFixerFlipped,
				}
			} catch (error) {
				console.error('Error applying audio settings to element:', error)
			}
		}
	})
}

function loadAndApplySettings() {
	const storageKey = window.location.hostname + window.location.pathname
	
	// Get saved settings from storage
	if (typeof browser !== 'undefined' && browser.storage) {
		browser.storage.local.get([storageKey]).then(result => {
			const pageSettings = result[storageKey] || {}
			if (Object.keys(pageSettings).length > 0) {
				console.log(`Content script loading settings for ${storageKey}:`, JSON.stringify(pageSettings))
				
				// Apply settings immediately if elements exist, otherwise wait
				const applySettingsWithRetry = (retryCount = 0) => {
					const elements = document.querySelectorAll('video, audio')
					if (elements.length > 0) {
						applyAudioSettings(pageSettings)
					} else if (retryCount < 10) {
						// Retry after 200ms if no elements found yet
						setTimeout(() => applySettingsWithRetry(retryCount + 1), 200)
					}
				}
				
				applySettingsWithRetry()
				
				// Also set up observer for dynamically added elements
				const observer = new MutationObserver(mutations => {
					let hasNewMediaElements = false
					mutations.forEach(mutation => {
						mutation.addedNodes.forEach(node => {
							if (node.nodeType === 1) { // Element node
								if (node.matches && (node.matches('video, audio') || node.querySelector('video, audio'))) {
									hasNewMediaElements = true
								}
							}
						})
					})
					
					if (hasNewMediaElements) {
						setTimeout(() => applyAudioSettings(pageSettings), 100)
					}
				})
				
				observer.observe(document.body, {
					childList: true,
					subtree: true
				})
			}
		}).catch(err => console.error('Error loading settings in content script:', err))
	}
}

// Run when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', loadAndApplySettings)
} else {
	loadAndApplySettings()
}

// Also run when page becomes visible (in case of navigation)
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		setTimeout(loadAndApplySettings, 200)
	}
})
