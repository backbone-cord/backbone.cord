;(function(Backbone) {
'use strict';

function _modelObserver(model) {
	var key, changed = model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers('shared', key, changed[key]);
	}
}

Backbone.Cord.SharedScope = {
	model: new Backbone.Model()
};

// Scope for a single globally shared Backbone model
// Listeners on the model are automatically added and removed
// Final cleanup is automatic on remove() when backbone calls stopListening()
Backbone.Cord.plugins.push({
	name: 'sharedscope',
	scope: {
		namespace: 'shared',
		observe: function() {
			if(!this._hasObservers('shared'))
				this.listenTo(Backbone.Cord.SharedScope.model, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!this._hasObservers('shared'))
				this.stopListening(Backbone.Cord.SharedScope.model, 'change', _modelObserver);
		},
		getValue: function(key) {
			return Backbone.Cord.SharedScope.model.get(key);
		},
		setValue: function(key, value) {
			Backbone.Cord.SharedScope.model.set(key, value);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
