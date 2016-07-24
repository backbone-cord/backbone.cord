;(function(Backbone) {
'use strict';

var PROPERTIES = ['syncing', 'syncProgress', 'syncError'];

// Default parseError method, Simply read the http status
Backbone.Cord.parseError = function(response) {
	return response.status;
};

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', function(mc, xhr) {
		this.syncProgress = 0.0;
		this.syncing = true;
		xhr.progress(function(evt) {
			if(evt.lengthComputable)
				this.syncProgress = evt.loaded / evt.total;
		}.bind(this));
	});
	this.listenTo(modelCollection, 'sync', function() {
		this.syncProgress = 1.0;
		this.syncing = false;
		this.syncError = null;
	});
	this.listenTo(modelCollection, 'error', function(collection, response, options) {
		this.syncProgress = 1.0;
		this.syncing = false;
		this.syncError = Backbone.Cord.parseError(response, options);
	});
}

// Wrap the sync method to detect when a request is taking place, only done in case a sync starts before being given to a View
// Apply listeners only once
var __modelSync = Backbone.Model.prototype.sync;
Backbone.Model.prototype.sync = function() {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	return __modelSync.apply(this, Array.prototype.slice.call(arguments));
};
var __collectionSync = Backbone.Collection.prototype.sync;
Backbone.Collection.prototype.sync = function() {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	return __collectionSync.apply(this, Array.prototype.slice.call(arguments));
};

// Do the listeners for the View to collection or model
function _setup() {
	var i, data = this.collection || this.model;
	if(data) {
		for(i = 0; i < PROPERTIES.length; ++i)
			this[PROPERTIES[i]] = this.model[PROPERTIES[i]];
		_addListeners.call(this, data);
	}
}

// Wrap both setModel and setCollection to addListeners and grab the current value of syncing
var __setModel = Backbone.Cord.View.prototype.setModel;
Backbone.Cord.View.prototype.setModel = function(newModel, noCascade) {
	var ret = __setModel.call(this, newModel, noCascade);
	_setup.call(this);
	return ret;
};
var __setCollection = Backbone.Cord.View.prototype.setCollection;
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	var ret = __setCollection.call(this, newCollection);
	_setup.call(this);
	return ret;
};

// Adds a "syncing" boolean property to the View to track when its collection or model is syncing
Backbone.Cord.plugins.push({
	name: 'syncing',
	create: function() {
		for(var i = 0; i < PROPERTIES.length; ++i)
			this._synthesizeProperty(PROPERTIES[i]);
		_setup.call(this);
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
