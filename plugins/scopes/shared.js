;(function(Backbone) {
'use strict';

var NAMESPACE = 'shared';

function _modelObserver(model) {
	var key, changed = model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers(key, changed[key], NAMESPACE);
	}
}

Backbone.Cord.Shared = {
	model: new Backbone.Model()
};

// Scope for a single globally shared Backbone model
// Listeners on the model are automatically added and removed
// Final cleanup is automatic on remove() when backbone calls stopListening()
Backbone.Cord.plugins.push({
	name: 'sharedscope',
	config: {
		sharedPrefix: '$'
	},
	scope: {
		namespace: NAMESPACE,
		getKey: function(key) {
			if(key.indexOf(Backbone.Cord.config.sharedPrefix) === 0)
				return key.substr(Backbone.Cord.config.sharedPrefix.length);
		},
		observe: function() {
			if(!Object.keys(this._getObservers(null, NAMESPACE)).length)
				this.listenTo(Backbone.Cord.Shared.model, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!Object.keys(this._getObservers(null, NAMESPACE)).length)
				this.stopListening(Backbone.Cord.Shared.model, 'change', _modelObserver);
		},
		getValue: function(key) {
			return Backbone.Cord.Shared.model.get(key);
		},
		setValue: function(key, value) {
			Backbone.Cord.Shared.model.set(key, value);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
