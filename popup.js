'use strict'

let tid = 0
const frameMap = new Map()
const elementsList = document.getElementById('elements-list')
const allElements = document.getElementById('all-elements')
const indivElements = document.getElementById('individual-elements')
const elementsTpl = document.getElementById('elements-tpl')

// Helper functions to convert between UI values and Web Audio API values
function uiGainToWebAudio(uiGain) {
	// Convert UI gain (-50 to 50) to Web Audio gain
	// UI: -50 = very quiet, 0 = normal, 50 = very loud
	// WebAudio: 0.01 = very quiet, 1.0 = normal, 10+ = very loud
	if (uiGain <= 0) {
		// Negative values: scale from 1.0 down to 0.01
		return Math.max(0.01, 1.0 + (uiGain / 50.0) * 0.99)
	} else {
		// Positive values: scale from 1.0 up to 10.0
		return 1.0 + (uiGain / 50.0) * 9.0
	}
}

function webAudioGainToUI(webAudioGain) {
	// Convert Web Audio gain back to UI value (-50 to 50)
	// WebAudio: 0.01 = very quiet, 1.0 = normal, 10+ = very loud
	// UI: -50 = very quiet, 0 = normal, 50 = very loud
	if (webAudioGain <= 1.0) {
		// Map 0.01-1.0 to -50 to 0
		return Math.round(((webAudioGain - 1.0) / 0.99) * 50.0)
	} else {
		// Map 1.0-10.0 to 0 to +50
		return Math.round(((webAudioGain - 1.0) / 9.0) * 50.0)
	}
}

function applySettings(fid, elid, newSettings) {
	return browser.tabs.executeScript(
		tid,
		{
			frameId: fid,
			code: `(function () {
				const el = document.querySelector('[data-x-soundfixer-id="${elid}"]')
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
				const newSettings = ${JSON.stringify(newSettings)}
				if ('gain' in newSettings) {
					// Convert UI gain value to Web Audio API gain value using conversion function
					function uiGainToWebAudio(uiGain) {
						if (uiGain <= 0) {
							return Math.max(0.01, 1.0 + (uiGain / 50.0) * 0.99)
						} else {
							return 1.0 + (uiGain / 50.0) * 9.0
						}
					}
					el.xSoundFixerGain.gain.value = uiGainToWebAudio(newSettings.gain)
				}
				if ('pan' in newSettings) {
					// Scale pan value from UI range (-5 to +5) to Web Audio API range (-1 to +1)
					const scaledPan = Math.max(-1, Math.min(1, newSettings.pan / 5))
					el.xSoundFixerPan.pan.value = scaledPan
				}
				if ('mono' in newSettings) {
					el.xSoundFixerContext.destination.channelCount = newSettings.mono ? 1 : el.xSoundFixerOriginalChannels
				}
				if ('flip' in newSettings) {
					el.xSoundFixerFlipped = newSettings.flip
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
				// Store UI values for consistent saving/loading
				function webAudioGainToUI(webAudioGain) {
					if (webAudioGain <= 1.0) {
						return Math.round(((webAudioGain - 1.0) / 0.99) * 50.0)
					} else {
						return Math.round(((webAudioGain - 1.0) / 9.0) * 50.0)
					}
				}
				el.xSoundFixerSettings = {
					gain: webAudioGainToUI(el.xSoundFixerGain.gain.value),
					pan: Math.round(el.xSoundFixerPan.pan.value * 5), // Convert back to UI range (-5 to +5)
					mono: el.xSoundFixerContext.destination.channelCount == 1,
					flip: el.xSoundFixerFlipped || false,
				}
			})()`
		}
	).then(() => {
		// Save complete settings to browser storage after applying them
		browser.tabs.get(tid).then(tab => {
			const url = new URL(tab.url)
			const storageKey = url.hostname + url.pathname

			// Get the complete current settings and element index by executing script
			browser.tabs.executeScript(tid, {
				frameId: fid, code: `(function () {
				const el = document.querySelector('[data-x-soundfixer-id="${elid}"]')
				if (el && el.xSoundFixerSettings) {
					// Find element index among all audio/video elements
					const allElements = Array.from(document.querySelectorAll('video, audio'))
					const elementIndex = allElements.indexOf(el)
					
					return {
						settings: el.xSoundFixerSettings,
						index: elementIndex
					}
				}
				return null
			})()` }).then(result => {
					const elementData = result[0]
					if (elementData && elementData.settings) {
						// Get existing settings for this page or create new object
						browser.storage.local.get([storageKey]).then(storageResult => {
							const pageSettings = storageResult[storageKey] || {}

							// Update settings for this specific element using index instead of frame ID
							pageSettings[`element_${elementData.index}`] = elementData.settings

							// Save back to storage
							browser.storage.local.set({ [storageKey]: pageSettings })
							console.log(`Saved complete settings for ${storageKey}:`, JSON.stringify(pageSettings))
						}).catch(err => console.error('Error saving settings:', err))
					}
				}).catch(err => console.error('Error getting complete settings:', err))
		}).catch(err => console.error('Error getting tab info:', err))
	})
}

browser.tabs.query({ currentWindow: true, active: true }).then(tabs => {
	tid = tabs[0].id
	return browser.webNavigation.getAllFrames({ tabId: tid }).then(frames =>
		Promise.all(frames.map(frame => {
			const fid = frame.frameId
			return browser.tabs.executeScript(tid, {
				frameId: fid, code: `(function () {
				const result = new Map()
				for (const el of document.querySelectorAll('video, audio')) {
					if (!el.hasAttribute('data-x-soundfixer-id')) {
						el.setAttribute('data-x-soundfixer-id',
							Math.random().toString(36).substr(2, 10))
					}
					result.set(el.getAttribute('data-x-soundfixer-id'), {
						type: el.tagName.toLowerCase(),
						isPlaying: (el.currentTime > 0 && !el.paused && !el.ended && el.readyState > 2),
						settings: el.xSoundFixerSettings
					})
				}
				return result
			})()` }).then(result => frameMap.set(fid, result[0]))
				.catch(err => {
					// Skip frames that can't be accessed due to permission restrictions
					if (err.message && err.message.includes('Missing host permission')) {
						console.log(`Skipping frame ${fid} due to permission restrictions`)
					} else {
						console.error(`tab ${tid} frame ${fid}`, err)
					}
				})
		}))
	)
}).then(_ => {
	// Load and apply saved settings for this page (with delay for proper initialization)
	browser.tabs.get(tid).then(tab => {
		const url = new URL(tab.url)
		const storageKey = url.hostname + url.pathname

		browser.storage.local.get([storageKey]).then(result => {
			const pageSettings = result[storageKey] || {}
			console.log(`Loading settings for ${storageKey}:`, JSON.stringify(pageSettings))


			// Add a small delay to ensure elements are ready, then apply saved settings
			setTimeout(() => {
				// Flatten all elements from all frames into a single array with their frame info
				// Renamed to avoid conflict with global allElements DOM element
				const allElementsData = []
				for (const [fid, els] of frameMap) {
					for (const [elid, el] of els) {
						allElementsData.push({ fid, elid, el })
					}
				}

				// Apply settings using natural array index
				allElementsData.forEach((elementData, index) => {
					const elementKey = `element_${index}`
					if (pageSettings[elementKey]) {
						console.log(`Applying saved settings to element ${elementKey}:`, pageSettings[elementKey])
						// Apply the complete saved settings
						applySettings(elementData.fid, elementData.elid, pageSettings[elementKey]).catch(err => {
							console.error(`Failed to apply settings to ${elementKey}:`, err)
						})
					}
				})
			}, 100) // 100ms delay to ensure elements are ready
		}).catch(err => console.error('Error loading settings:', err))
	}).catch(err => console.error('Error getting tab info for loading:', err))

	elementsList.textContent = ''
	let elCount = 0

	// Get saved settings from storage for UI display
	browser.tabs.get(tid).then(tab => {
		const url = new URL(tab.url)
		const storageKey = url.hostname + url.pathname

		browser.storage.local.get([storageKey]).then(result => {
			const savedPageSettings = result[storageKey] || {}

			// Build UI with saved settings
			// Renamed to avoid conflict with global allElements DOM element
			const allElementsArray = []
			for (const [fid, els] of frameMap) {
				for (const [elid, el] of els) {
					allElementsArray.push({ fid, elid, el })
				}
			}

			allElementsArray.forEach((elementData, index) => {
				const { fid, elid, el } = elementData
				const elementKey = `element_${index}`
				const settings = savedPageSettings[elementKey] || {}
				const node = document.createElement('li')
				node.appendChild(document.importNode(elementsTpl.content, true))
				node.dataset.fid = fid
				node.dataset.elid = elid
				node.querySelector('.element-label').textContent = `
				${el.type.charAt(0).toUpperCase() + el.type.slice(1)}
				${elCount + 1}
				${fid ? `in frame ${fid}` : ''}
				${el.isPlaying ? '' : '(not playing)'}
			`
				if (!el.isPlaying)
					node.querySelector('.element-label').classList.add('element-not-playing')
				const gain = node.querySelector('.element-gain')
				const gainNumberInput = node.querySelector('.element-gain-num')
				gain.value = settings.gain || 0
				gain.parentElement.querySelector('.element-gain-num').value = '' + gain.value
				gain.addEventListener('input', function () {
				// We used a function expression thus gain === this
				applySettings(fid, elid, { gain: this.value })
				this.parentElement.querySelector('.element-gain-num').value = '' + this.value
			})
			// Double-click to reset gain to 0
			gain.addEventListener('dblclick', function () {
				this.value = 0
				this.parentElement.querySelector('.element-gain-num').value = '0'
				applySettings(fid, elid, { gain: 0 })
			})
				gainNumberInput.addEventListener('input', function () {
					if (+this.value > +this.getAttribute('max'))
						this.value = this.getAttribute('max')
					if (+this.value < +this.getAttribute('min'))
						this.value = this.getAttribute('min')

					applySettings(fid, elid, { gain: this.value })
					this.parentElement.querySelector('.element-gain').value = '' + this.value
				})
				const pan = node.querySelector('.element-pan')
				const panNumberInput = node.querySelector('.element-pan-num')
				pan.value = settings.pan || 0
				pan.parentElement.querySelector('.element-pan-num').value = '' + pan.value
				pan.addEventListener('input', function () {
					applySettings(fid, elid, { pan: this.value })
					this.parentElement.querySelector('.element-pan-num').value = '' + this.value
				})
				// Double-click to reset pan to 0
				pan.addEventListener('dblclick', function () {
					this.value = 0
					this.parentElement.querySelector('.element-pan-num').value = '0'
					applySettings(fid, elid, { pan: 0 })
				})
				panNumberInput.addEventListener('input', function () {
					if (+this.value > +this.getAttribute('max'))
						this.value = this.getAttribute('max')
					if (+this.value < +this.getAttribute('min'))
						this.value = this.getAttribute('min')

					applySettings(fid, elid, { pan: this.value })
					this.parentElement.querySelector('.element-pan').value = '' + this.value
				})
				const mono = node.querySelector('.element-mono')
			mono.checked = settings.mono || false
			// Set initial pan disabled state based on mono
			pan.disabled = mono.checked
			panNumberInput.disabled = mono.checked
			mono.addEventListener('change', _ => {
				// When mono is checked, disable pan and reset to 0
				if (mono.checked) {
					pan.value = 0
					panNumberInput.value = '0'
					applySettings(fid, elid, { pan: 0, mono: true })
				} else {
					applySettings(fid, elid, { mono: false })
				}
				pan.disabled = mono.checked
				panNumberInput.disabled = mono.checked
			})
				const flip = node.querySelector('.element-flip')
				flip.checked = settings.flip || false
				flip.addEventListener('change', _ => {
					applySettings(fid, elid, { flip: flip.checked })
				})
				node.querySelector('.element-reset').onclick = function () {
					gain.value = 0
					gain.parentElement.querySelector('.element-gain-num').value = '' + gain.value
					pan.value = 0
					pan.parentElement.querySelector('.element-pan-num').value = '' + pan.value
					mono.checked = false
					flip.checked = false
					saveAllMediaSettings({ gain: 0, pan: 0, mono: false, flip: false })
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							applySettings(fid, elid, { gain: 1, pan: 0, mono: false, flip: false })
						}
					}
				}
				elementsList.appendChild(node)
				elCount += 1
			})

			if (elCount == 0) {
				allElements.innerHTML = 'No audio/video found in the current tab. Note that some websites do not work because of cross-domain security restrictions.'
				indivElements.remove()
			} else {
				const node = document.createElement('div')
				node.appendChild(document.importNode(elementsTpl.content, true))
				node.querySelector('.element-label').textContent = `All media on the page`
				const gain = node.querySelector('.element-gain')
				const gainNumberInput = node.querySelector('.element-gain-num')
				// Load saved state for All media control (use 'all_media' as key)
				const allMediaSettings = savedPageSettings['all_media'] || {}
				gain.value = allMediaSettings.gain || 0
				gainNumberInput.value = '' + gain.value
				
				// Function to save All media control settings
				function saveAllMediaSettings(newSettings) {
					browser.storage.local.get([storageKey]).then(result => {
						const pageSettings = result[storageKey] || {}
						const currentAllMediaSettings = pageSettings['all_media'] || {}
						// Merge new settings with existing ones
						pageSettings['all_media'] = { ...currentAllMediaSettings, ...newSettings }
						browser.storage.local.set({ [storageKey]: pageSettings })
						console.log(`Saved All media settings for ${storageKey}:`, pageSettings['all_media'])
					}).catch(err => console.error('Error saving All media settings:', err))
				}
				function applyGain(value) {
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							applySettings(fid, elid, { gain: value })
							const egain = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`)
							egain.value = value
							egain.parentElement.querySelector('.element-gain-num').value = '' + value
						}
					}
					gain.value = value
					gainNumberInput.value = '' + value
				}
				gain.addEventListener('input', _ => {
					applyGain(gain.value)
					saveAllMediaSettings({ gain: +gain.value })
				})
				// Double-click to reset gain to 0
				gain.addEventListener('dblclick', function () {
					this.value = 0
					this.parentElement.querySelector('.element-gain-num').value = '0'
					applyGain(0)
					saveAllMediaSettings({ gain: 0 })
				})
				gainNumberInput.addEventListener('input', function () {
					if (+this.value > +this.getAttribute('max'))
						this.value = this.getAttribute('max')
					if (+this.value < +this.getAttribute('min'))
						this.value = this.getAttribute('min')
					applyGain(+this.value)
					saveAllMediaSettings({ gain: +this.value })
				})
				
				// Pan controls
				const pan = node.querySelector('.element-pan')
				const panNumberInput = node.querySelector('.element-pan-num')
				pan.value = allMediaSettings.pan || 0
				panNumberInput.value = '' + pan.value
				
				function applyPan(value) {
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							// Check if this individual element has mono checked
							const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`)
							const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`)
							
							// Skip applying pan if this element has mono checked
							if (!emono.checked) {
								applySettings(fid, elid, { pan: value })
								epan.value = value
								epan.parentElement.querySelector('.element-pan-num').value = '' + value
							}
							
							// Always update the disabled state regardless
							epan.disabled = emono.checked
							epan.parentElement.querySelector('.element-pan-num').disabled = emono.checked
						}
					}
					pan.value = value
					panNumberInput.value = '' + value
					// Disable/enable pan based on mono state
					const mono = node.querySelector('.element-mono')
					pan.disabled = mono.checked
					panNumberInput.disabled = mono.checked
				}
				
				pan.addEventListener('input', _ => {
					applyPan(pan.value)
					saveAllMediaSettings({ pan: +pan.value })
				})
				// Double-click to reset pan to 0
				pan.addEventListener('dblclick', function () {
					this.value = 0
					this.parentElement.querySelector('.element-pan-num').value = '0'
					applyPan(0)
					saveAllMediaSettings({ pan: 0 })
				})
				panNumberInput.addEventListener('input', function () {
					if (+this.value > +this.getAttribute('max'))
						this.value = this.getAttribute('max')
					if (+this.value < +this.getAttribute('min'))
						this.value = this.getAttribute('min')
					applyPan(+this.value)
					saveAllMediaSettings({ pan: +this.value })
				})
				const mono = node.querySelector('.element-mono')
				mono.checked = allMediaSettings.mono || false
				mono.addEventListener('change', function() {
					// When mono is checked, disable pan and reset to 0
					if (this.checked) {
						pan.value = 0
						panNumberInput.value = '0'
						applyPan(0)
					}
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							applySettings(fid, elid, { mono: this.checked, ...(this.checked && { pan: 0 }) })
							const emono = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`)
							emono.checked = this.checked
							// Disable individual element pan controls too
							const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`)
							const epanInput = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan-num`)
							epan.disabled = this.checked
							epanInput.disabled = this.checked
							if (this.checked) {
								epan.value = 0
								epanInput.value = '0'
							}
						}
					}
					pan.disabled = this.checked
					panNumberInput.disabled = this.checked
					saveAllMediaSettings({ mono: this.checked, ...(this.checked && { pan: 0 }) })
				})
				const flip = node.querySelector('.element-flip')
				flip.checked = allMediaSettings.flip || false
				flip.addEventListener('change', _ => {
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							applySettings(fid, elid, { flip: flip.checked })
							const eflip = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`)
							eflip.checked = flip.checked
						}
					}
					saveAllMediaSettings({ flip: flip.checked })
				})
				node.querySelector('.element-reset').onclick = function () {
					gain.value = 0
					gain.parentElement.querySelector('.element-gain-num').value = '' + gain.value
					pan.value = 0
					pan.parentElement.querySelector('.element-pan-num').value = '' + pan.value
					mono.checked = false
					flip.checked = false
					for (const [fid, els] of frameMap) {
						for (const [elid, el] of els) {
							const egain = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-gain`)
							egain.value = 0
							egain.parentElement.querySelector('.element-gain-num').value = '' + egain.value
							const epan = document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-pan`)
							epan.value = 0
							epan.parentElement.querySelector('.element-pan-num').value = '' + epan.value
							document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-mono`).checked = false
							document.querySelector(`[data-fid="${fid}"][data-elid="${elid}"] .element-flip`).checked = false
							applySettings(fid, elid, { gain: 0, pan: 0, mono: false, flip: false })
						}
					}
				}
				allElements.appendChild(node)
			}
		})
	})
})
