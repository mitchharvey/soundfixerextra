'use strict'

const maxGain = 20
const maxPan = 10

function uiGainToWebAudio(uiGain) {
	// Convert UI gain (-50 to 50) to Web Audio gain
	// UI: -50 = very quiet, 0 = normal, 50 = very loud
	if (uiGain <= 0) {
		// Negative values: scale from 1.0 down to 0.001
		return Math.max(0.001, 1.0 + (uiGain / 50.0) * 0.99)
	} else {
		// Positive values: scale from 1.0 up to maxGain
		return 1.0 + (uiGain / 50.0) * (maxGain - 1.0)
	}
}

function webAudioGainToUI(webAudioGain) {
	// Convert Web Audio gain back to UI value (-50 to 50)
	// WebAudio: 0.001 = very quiet, 1.0 = normal, 30+ = very loud
	// UI: -50 = very quiet, 0 = normal, 50 = very loud
	if (webAudioGain <= 1.0) {
		// Map 0.001-1.0 to -50 to 0
		return Math.round(((webAudioGain - 1.0) / 0.99) * 50.0)
	} else {
		// Map 1.0-maxGain to 0 to +50
		return Math.round(((webAudioGain - 1.0) / (maxGain - 1.0)) * 50.0)
	}
}

function uiPanToWebAudio(uiPan) {
	return uiPan / maxPan
}

function webAudioPanToUI(webAudioPan) {
	return webAudioPan * maxPan
}

function generateStorageKey(hostname, pathname) {
	return hostname + pathname
}

function getCurrentPageStorageKey() {
	return generateStorageKey(window.location.hostname, window.location.pathname)
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		uiGainToWebAudio,
		webAudioGainToUI,
		uiPanToWebAudio,
		webAudioPanToUI,
		generateStorageKey,
		getCurrentPageStorageKey
	}
} else {
	window.SoundFixerUtils = {
		uiGainToWebAudio,
		webAudioGainToUI,
		uiPanToWebAudio,
		webAudioPanToUI,
		generateStorageKey,
		getCurrentPageStorageKey
	}
}
