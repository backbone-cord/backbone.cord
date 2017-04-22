;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Backbone.Model;
var _scopes = Cord._scopes;

function _createUnmanagedScope(namespace, model) {
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

Cord.UnmanagedScopes = {
	set: function(namespace, model) {
		namespace = namespace.toLowerCase();
		if(_scopes[namespace])
			throw new Error('Attempting to override an existing scope.');
		_scopes[namespace] = _createUnmanagedScope(namespace, model);
		this[namespace] = model;
	}
};

// Create standard unmanaged scopes for global shared and route
Cord.UnmanagedScopes.set('shared', new Model());
Cord.UnmanagedScopes.set('route', new Model());

// Plugin for adding scopes into models not managed by views
// Does not supporting setting an already created namespace
// i.e. don't set a namespace to a new model there currently isn't a way to notify all views observering the scope
Cord.plugins.push({ name: 'unmanagedscopes' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
