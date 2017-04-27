;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var Collection = Cord.Collection;
var ForceValue = Cord.ForceValue;

// Default parseError method, Simply read the http status
Cord.parseError = Cord.parseError || function(response) {
	return response.status;
};

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', function() {
		this.setValueForKey('syncProgress', new ForceValue(0.0));
		this.setValueForKey('syncing', new ForceValue(true));
		this.setValueForKey('syncError', new ForceValue(null));
	});
	this.listenTo(modelCollection, 'sync', function() {
		this.setValueForKey('syncProgress', new ForceValue(1.0));
		this.setValueForKey('syncing', new ForceValue(false));
		this.setValueForKey('syncError', new ForceValue(null));
	});
	this.listenTo(modelCollection, 'error', function(collection, response, options) {
		this.setValueForKey('syncProgress', new ForceValue(1.0));
		this.setValueForKey('syncing', new ForceValue(false));
		this.setValueForKey('syncError', new ForceValue(Cord.parseError(response, options)));
	});
}

function _onProgress(evt) {
	if(evt.lengthComputable)
		this.setValueForKey('syncProgress', new ForceValue(evt.loaded / evt.total));
}

function _startSync(method, model, options) {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	// Progress event must be added only through the xhr factory since the jqXHR object after ajax() and beforeSend() etc. doesn't have access to the actual XHR
	var __xhr = options.xhr || (Backbone.$.ajaxSettings && Backbone.$.ajaxSettings.xhr) || function() { return new window.XMLHttpRequest(); };
	var onprogress = _onProgress.bind(this);
	options.xhr = function() {
		var xhr = __xhr();
		xhr.addEventListener('progress', onprogress);
		xhr.upload.addEventListener('progress', onprogress);
		return xhr;
	};
}

// Wrap the sync method to detect when a request is taking place, only done in case a sync starts before being given to a View
// Apply listeners only once
var __modelSync = Model.prototype.sync;
Model.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __modelSync.apply(this, arguments);
};
var __collectionSync = Collection.prototype.sync;
Collection.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __collectionSync.apply(this, arguments);
};

Cord.mixins.syncing = {
	properties: {
		syncing: {
			value: false,
			readonly: true
		},
		syncProgress: {
			value: 0.0,
			readonly: true
		},
		syncError: {
			value: null,
			readonly: true
		}
	},
	_initSyncingProperties: function(modelCollection) {
		if(modelCollection) {
			this.setValueForKey('syncing', new ForceValue(modelCollection.syncing));
			this.setValueForKey('syncProgress', new ForceValue(modelCollection.syncProgress));
			this.setValueForKey('syncError', new ForceValue(modelCollection.syncError));
			_addListeners.call(this, modelCollection);
		}
	},
	setModel: function(model) {
		this._initSyncingProperties(model);
	},
	setCollection: function(collection) {
		this._initSyncingProperties(collection);
	}
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
