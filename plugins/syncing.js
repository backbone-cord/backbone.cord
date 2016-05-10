;(function(Backbone) {
'use strict';

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', function() {
		this.syncing = true;
	});
	this.listenTo(modelCollection, 'sync', function() {
		this.syncing = false;
		this.error = null;
	});
	this.listenTo(modelCollection, 'error', function(collection, response, options) {
		this.syncing = false;
		this.error = Backbone.Cord.parseError(response, options);
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
	var key = 'syncing';
	if(this.collection) {
		this[key] = !!this.collection[key];
		_addListeners.call(this, this.collection);
	}
	else if(this.model) {
		this[key] = !!this.model[key];
		_addListeners.call(this, this.model);
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

// Default parseError method, Simply read the http status
Backbone.Cord.parseError = function(response) {
	return response.status;
};

// Adds a "syncing" boolean property to the View to track when its collection or model is syncing
Backbone.Cord.plugins.push({
	name: 'syncing',
	create: function() {
		this._synthesizeProperty('syncing');
		this._synthesizeProperty('error');
		_setup.call(this);
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
