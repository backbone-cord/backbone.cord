;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var getFunctionArgs = Cord.getFunctionArgs;

function _createArgObserver(key, getFunc, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		this[key] = new Cord.ForceValue(getFunc.apply(this, values));
	};
}

Cord.plugins.push({
	name: 'computed',
	extend: function(context) {
		// Set all computed properties to be readonly
		var properties, key, definition;
		properties = context.protoProps.properties;
		if(properties) {
			for(key in properties) {
				if(properties.hasOwnProperty(key)) {
					definition = properties[key];
					if(typeof definition === 'function' && getFunctionArgs(definition).length) {
						properties[key] = {get: definition, readonly: true};
					}
					else if(Cord.isPlainObj(definition) && definition.get && getFunctionArgs(definition.get).length) {
						definition.readonly = true;
					}
				}
			}
		}
	},
	initialize: function() {
		// Enumerate all of the get properties to determine which has a get method with arguments
		if(this.properties) {
			var key, prop, args, i, observer;
			for(key in this.properties) {
				if(this.properties.hasOwnProperty(key)) {
					prop = Object.getOwnPropertyDescriptor(this, key);
					if(prop && prop.get) {
						args = getFunctionArgs(prop.get);
						if(args.length) {
							// The observer method then will use the specified get to set the value with each arg
							observer = _createArgObserver(key, prop.get, args);
							// Replace the get with a default getter
							Object.defineProperty(this, key, {get: this._synthesizeGetter(key)});
							for(i = 0; i < args.length; ++i)
								this.observe(args[i], observer, i === 0);
						}
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
