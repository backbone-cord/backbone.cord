;(function(Backbone) {
'use strict';

function _getFunctionArgs(func) {
	// Get all argument names for a function
	// Based on http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
	var str = func.toString();
	var args = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(/([^\s,]+)/g);
	if(!args)
		args = [];
	return args;
}

function _createArgObserver(key, getFunc, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValue(args[i]));
		this[key] = getFunc.apply(this, values);
	};
}

function _createDefaultGetter(key) {
	return function() { return this._getWrappedProperty(key); };
}

Backbone.Cord.plugins.push({
	name: 'calculated',
	initialize: function() {
		// Enumerate all of the get properties to determine which has a get method with arguments
		if(this.properties) {
			var key, prop, args, i, observer;
			for(key in this.properties) {
				if(this.properties.hasOwnProperty(key)) {
					prop = Object.getOwnPropertyDescriptor(this, key);
					if(prop && prop.get) {
						args = _getFunctionArgs(prop.get);
						if(args.length) {
							console.log(key + ' is calculated');
							// The observer method then will call this._setKey(argValues...);
							observer = _createArgObserver(key, prop.get, args);
							for(i = 0; i < args.length; ++i)
								this.observe(args[i], observer, i === 0);
							// The get then needs to be replaced with a default getter
							Object.defineProperty(this, key, {get: _createDefaultGetter(key)});
						}
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone);
