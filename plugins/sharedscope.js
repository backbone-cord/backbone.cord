;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;

function _modelObserver(model) {
	var key, changed = model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers('shared', key, changed[key]);
	}
}

Cord.SharedScope = {
	model: new Backbone.Model()
};

var sharedModel = Cord.SharedScope.model;

// Scope for a single globally shared Backbone model
// Final cleanup is automatic on remove() when backbone calls stopListening()
Cord.plugins.push({
	name: 'sharedscope',
	scope: {
		namespace: 'shared',
		observe: function() {
			if(!this._hasObservers('shared'))
				this.listenTo(sharedModel, 'change', _modelObserver);
		},
		unobserve: function() {
			if(!this._hasObservers('shared'))
				this.stopListening(sharedModel, 'change', _modelObserver);
		},
		getValue: function(key) {
			return sharedModel.get(key);
		},
		setValue: function(key, value) {
			sharedModel.set(key, value);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
