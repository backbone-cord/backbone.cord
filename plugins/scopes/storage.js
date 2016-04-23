;(function(root) {
'use strict';

var Backbone = root.Backbone;

root.Storage.prototype.setItemTrigger = function(key, value) {
	// Just doing a setItem will trigger storage events on other windows but not the current one
	// This method will trigger on all windows as a result
	// https://developer.mozilla.org/en-US/docs/Web/Events/storage
	// https://developer.mozilla.org/en-US/docs/Web/API/StorageEvent
	var evt = document.createEvent('StorageEvent');
	evt.initStorageEvent('storage', true, true, key, this.getItem(key), value, root.location.href, this);
	this.setItem(key, value);
	root.dispatchEvent(evt);
};

function _storageListener(name, e) {
	this._invokeObservers(e.key, e.newValue, name);
}

function _storagePlugin(name, prefix, storage) {
	var prefixKey = name + 'Prefix';
	var plugin = {
		name: name,
		scope: {
			getKey: function(key) {
				if(key.indexOf(Backbone.Cord.config[prefixKey]) === 0)
					return key.substr(Backbone.Cord.config[prefixKey].length);
			},
			observe: function() {
				if(!Object.keys(this._getObservers(null, name)).length) {
					this._storageListener = _storageListener.bind(this, name);
					root.addEventListener('storage', this._storageListener);
				}
			},
			unobserve: function() {
				if(!Object.keys(this._getObservers(null, name)).length)
					root.removeEventListener('storage', this._storageListener);
			},
			getValue: function(key) {
				return storage.getItem(key);
			},
			setValue: function(key, value) {
				storage.setItemTrigger(key, value);
			}
		},
		remove: function() {
			root.removeEventListener('storage', this._storageListener);
		}
	};
	plugin.config = {};
	plugin.config[prefixKey] = prefix;
	return plugin;
}

Backbone.Cord.plugins.push(_storagePlugin('localstoragescope', 'ls_', root.localStorage));
Backbone.Cord.plugins.push(_storagePlugin('sessionstoragescope', 'ss_', root.sessionStorage));

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));
