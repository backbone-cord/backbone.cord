;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Backbone.Model;
var scopes = Cord.scopes;

function _createSharedScope(namespace, model) {
	var _modelObserver = function(model) {
		var key, changed = model.changedAttributes();
		if(!changed)
			return;
		for(key in changed) {
			if(changed.hasOwnProperty(key))
				this._invokeObservers(namespace, key, changed[key]);
		}
	};
	// NOTE: Final cleanup is automatic on remove() when backbone calls stopListening()
	return {
		namespace: namespace,
		model: model,
		observe: function() {
			if(!this._hasObservers(namespace))
				this.listenTo(model, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!this._hasObservers(namespace))
				this.stopListening(model, 'change', _modelObserver);
		},
		getValue: function(key) {
			return model.get(key);
		},
		setValue: function(key, value) {
			model.set(key, value);
		}
	};
}

Cord.SharedScopes = {
	// Does not support setting an already created namespace
	set: function(namespace, model) {
		namespace = namespace.toLowerCase();
		if(scopes[namespace])
			throw new Error('Attempting to override an existing scope.');
		scopes[namespace] = _createSharedScope(namespace, model);
		this[namespace] = model;
	}
};

// Create standard unmanaged scopes for global shared and route
Cord.SharedScopes.set('shared', new Model());
Cord.SharedScopes.set('route', new Model());

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
