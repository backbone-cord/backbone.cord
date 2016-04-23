;(function(Backbone) {
'use strict';

var SCOPE_NAME = 'sharedscope';

function _modelObserver(model) {
	var key, changed = model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers(key, changed[key], SCOPE_NAME);
	}
}

Backbone.Cord.shared = new Backbone.Model();

// Scope for a single globally shared Backbone model
// Listeners on the model are automatically added and removed
// Final cleanup is automatic on remove() when backbone calls stopListening()
Backbone.Cord.plugins.push({
	name: SCOPE_NAME,
	config: {
		sharedPrefix: '$'
	},
	scope: {
		getKey: function(key) {
			if(key.indexOf(Backbone.Cord.config.sharedPrefix) === 0)
				return key.substr(Backbone.Cord.config.sharedPrefix.length);
		},
		observe: function() {
			if(!Object.keys(this._getObservers(null, SCOPE_NAME)).length)
				this.listenTo(Backbone.Cord.shared, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!Object.keys(this._getObservers(null, SCOPE_NAME)).length)
				this.stopListening(Backbone.Cord.shared, 'change', _modelObserver);
		},
		getValue: function(key) {
			return Backbone.Cord.shared.get(key);
		},
		setValue: function(key, value) {
			Backbone.Cord.shared.set(key, value);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
