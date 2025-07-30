'use strict'

// Content script that runs automatically on page load to apply saved audio settings

function applyAudioSettings(settings) {
	// Find all audio/video elements on the page
	const elements = document.querySelectorAll('video, audio')
	
	elements.forEach((el, index) => {
		// Assign unique ID if not already present (matches popup.js logic)
		if (!el.hasAttribute('data-x-soundfixer-id')) {
			el.setAttribute('data-x-soundfixer-id', Math.random().toString(36).substr(2, 10))
		}
		
		const elementId = el.getAttribute('data-x-soundfixer-id')
		const elementKey = `element_${elementId}`
		
		// Check for individual element settings first, then fall back to all_media settings
		let settingsToApply = {}
		
		// Apply all_media settings as default
		if (settings.all_media) {
			settingsToApply = { ...settings.all_media }
		}
		
		// Override with individual element settings if they exist
		if (settings[elementKey]) {
			settingsToApply = { ...settingsToApply, ...settings[elementKey] }
		}
		
		// Only proceed if we have settings to apply
		if (Object.keys(settingsToApply).length === 0) {
			return
		}
		
		console.log(`Applying saved settings to element ${elementKey}:`, settingsToApply)
		
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
			
			// Apply saved settings with proper conversions (using same logic as popup.js)
			if ('gain' in settingsToApply) {
				const webAudioGain = uiGainToWebAudio(settingsToApply.gain)
				el.xSoundFixerGain.gain.value = webAudioGain
				console.log(`Applied gain: UI=${settingsToApply.gain}, WebAudio=${webAudioGain}`)
			}
			if ('pan' in settingsToApply) {
				el.xSoundFixerPan.pan.value = settingsToApply.pan / 100.0
				console.log(`Applied pan: ${settingsToApply.pan}`)
			}
			if ('mono' in settingsToApply) {
				el.xSoundFixerContext.destination.channelCount = settingsToApply.mono ? 1 : el.xSoundFixerOriginalChannels
				console.log(`Applied mono: ${settingsToApply.mono}`)
			}
			if ('flip' in settingsToApply) {
				el.xSoundFixerFlipped = settingsToApply.flip
				try {
					el.xSoundFixerMerge.disconnect()
					el.xSoundFixerPan.disconnect()
				} catch (e) {
					// Ignore disconnect errors - nodes may not be connected yet
				}
				if (el.xSoundFixerFlipped) {
					el.xSoundFixerPan.connect(el.xSoundFixerSplit)
					el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 0, 1)
					el.xSoundFixerSplit.connect(el.xSoundFixerMerge, 1, 0)
					el.xSoundFixerMerge.connect(el.xSoundFixerContext.destination)
				} else {
					el.xSoundFixerPan.connect(el.xSoundFixerContext.destination)
				}
				console.log(`Applied flip: ${settingsToApply.flip}`)
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
	})
}

function loadAndApplySettings() {
	const storageKey = getCurrentPageStorageKey()
	
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
