;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var compatibilityMode = root.cordCompatibilityMode;
var debug = root.cordDebug;

// Initialize the Cord View class depending on the compatibility mode
var View = compatibilityMode ? Backbone.View.extend({}) : Backbone.View;
var Model = compatibilityMode ? Backbone.Model.extend({}) : Backbone.Model;
var Collection = compatibilityMode ? Backbone.Collection.extend({}) : Backbone.Collection;

/*
 * Main Cord object.
 * Do NOT overwrite any top-level members, only modify sub objects such as Cord.regex.x
 * Inside modules, only alias top-level members not the modifiable nested because those may change, for example var regex = Cord.regex
 */
var Cord = Backbone.Cord = {
	VERSION: '1.0.32',

	// View, Model, and Collection
	View: View,
	Model: Model,
	Collection: Collection,

	// EmptyView, EmptyModel, and EmptyCollection to use as default model, subview placeholder, and fallback collection on setCollection(null)
	EmptyView: View.extend({ tagName: 'meta' }),
	EmptyModel: new (Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyCollection: new (Collection.extend({add: function() { return this; }, reset: function() { return this; }, set: function() { return this; }, toString: function() { return ''; }}))(),

	// Mixins installed by the app by setting keys on this object
	mixins: {},

	// Filters installed by the app by setting keys on this object
	filters: {
		lower: function(str) { return Cord.convertToString(str).toLowerCase(); },
		upper: function(str) { return Cord.convertToString(str).toUpperCase(); },
		title: function(str) { return Cord.convertToString(str).replace(/\b[^\s-]*/g, function(s) { return s.charAt(0).toUpperCase() + s.substr(1).toLowerCase(); }); }
	},

	// Value decoders and encoders for when "value" is get or set on an element, keys into decoders/encoders is based on the data-type and type attribute
	decoders: {
		range: function(el) { return parseInt(el.value); },
		number: function(el) { return Number(el.value); },
		int: function(el) { return parseInt(el.value); },
		integer: function(el) { return parseInt(el.value); },
		float: function(el) { return parseFloat(el.value); },
		decimal: function(el) { return parseFloat(el.value); },
		date: function(el) { return new Date(el.value); },
		datetime: function(el) { return new Date(el.value); },
		bool: function(el) { return el.checked; },
		checkbox: function(el) { return el.checked; }
	},
	encoders: {
		date: function(el, value) { el.value = value.toDateString(); },
		datetime: function(el, value) { el.value = value.toString(); },
		bool: function(el, value) { el.checked = Cord.convertToBool(value); },
		checkbox: function(el, value) { el.checked = Cord.convertToBool(value); }
	},
	decodeValue: function(el) {
		var decoder = Cord.decoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(el.hasAttribute('data-null') && !el.value)
			return null;
		return decoder ? decoder(el) : el.value;
	},
	encodeValue: function(el, value) {
		var encoder = Cord.encoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(encoder)
			encoder(el, value);
		else
			el.value = Cord.convertToString(value);
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('change', true, true);
		el.dispatchEvent(evt);
		evt = document.createEvent('HTMLEvents');
		evt.initEvent('input', true, true);
		el.dispatchEvent(evt);
	},

	// Internally set readonly properties with the ForceValue object Backbone only
	ForceValue: function(value) { this.value = value; },

	// Conversion functions
	convertToString: function(obj) { if(obj === null || obj === void(0)) return ''; return obj.toString(); },
	convertToBool: function(value) { return !!(value && (value.length === void(0) || value.length)); },
	convertToNumber: function(value) { return Number(value) || 0; },

	// Generate a 2-byte time-secured random uid by taking the last 4 characters of a number between 0x10000 and 0x20000
	randomUID: function() { return (Math.floor((1 + Math.random()) * 0x10000) ^ (Date.now() % 0x10000)).toString(16).substr(1); }, // jshint ignore:line
	randomGUID: function() { var c4 = Cord.randomUID; return c4() + c4() + '-' + c4() + '-' + c4() + '-' + c4() + '-' + c4() + c4() + c4(); },
	randomCode: function(len) { var c = ''; len = len || 12; while(c.length < len) c += Cord.randomUID(); return c.substr(0, len); },

	// Run a callback immediately after the current call stack
	setImmediate: (root.requestAnimationFrame || root.setTimeout).bind(root),
	clearImmediate: (root.cancelAnimationFrame || root.clearTimeout).bind(root),

	// Class attribute manipulation functions
	// Use get/set attribute because className doesn't work with svg elements
	// cls argument for add/remove can be a space separated string or an array of single class strings
	hasClass: function(el, cls) {
		return (el.getAttribute('class') || '').split(' ').indexOf(cls) !== -1;
	},
	addClass: function(el, cls) {
		if(!Array.isArray(cls))
			cls = cls.split(' ');
		for(var i = 0; i < cls.length; ++i) {
			if(!Cord.hasClass(el, cls[i]))
				el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls[i]).trim());
		}
	},
	removeClass: function(el, cls) {
		var i, clss = (el.getAttribute('class') || '').split(' ');
		if(!Array.isArray(cls))
			cls = cls.split(' ');
		for(i = clss.length - 1; i >= 0; --i) {
			if(cls.indexOf(clss[i]) !== -1)
				clss.splice(i, 1);
		}
		el.setAttribute('class', clss.join(' '));
	},

	// Unique internal subview id, this unifies how subviews with and without ids are stored
	scopes: {},

	// Override or wrap to provide different keyPath processing, different prefixes, or shorthands
	// The return value must be an array of the different key path components, with the first being the namespace normalized to lowercase
	parseKeyPath: function(keyPath) {
		var components;
		keyPath = keyPath.replace(/__/g, '.');
		components = keyPath.split('.');
		// Default to the view scope
		if(components.length === 1 || !Cord.scopes[components[0].toLowerCase()])
			components.unshift('this');
		else
			components[0] = components[0].toLowerCase();
		return components;
	},

	// Regular expressions
	// NOTE: Do not use the regex functions test/exec when the global flag is set because it is stateful (lastIndex). Instead use string methods search/match
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Working_with_regular_expressions
	regex: {}
};

/******************* Interpolation regex *******************/

function _escapeRegExp(str) { return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&'); }
function _regexPropertyDescriptor(name) {
	var search = name + 'Search';
	var value = name + 'Value';
	name = '_' + name;
	return {
		get: function() { return this[name]; },
		set: function(format) {
			this[name] = format;
			this[search] = new RegExp(_escapeRegExp(format.prefix) + '.*?' + _escapeRegExp(format.suffix), 'g');
			this[value] = new RegExp(_escapeRegExp(format.prefix) + '\\s*(.*?)\\s*' + _escapeRegExp(format.suffix));
		}
	};
}
Object.defineProperties(Cord.regex, {
	variable: _regexPropertyDescriptor('variable'),
	conditional: _regexPropertyDescriptor('conditional')
});
// Regex patterns can be configured by setting prefix/suffix values through these properties
Cord.regex.variable = {prefix: '[', suffix: ']'};
Cord.regex.conditional = {prefix: '(', suffix: ')'};

/******************* Utilities *******************/

// Helper functions for mixing objects and prototypes
function _chain(f1, f2) { return function() { f1.apply(this, arguments); return f2.apply(this, arguments); }; }

// Returns true if the given object is an instance of Object and not of a subclass or other type
function _isPlainObj(obj) {
	// First check of just obj is needed because typeof null is object
	return (obj && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype);
}

// Create a deep copy of plain objects
// Anything not a plain object (subclass, function, array, etc) will be copied by reference
function _copyObj(obj) {
	var key, value, copy = {};
	for(key in obj) {
		value = obj[key];
		if(_isPlainObj(value))
			value = _copyObj(value);
		copy[key] = value;
	}
	return copy;
}

// Copy attributes into the first object argument given a number of additional object arguments
function _extendObj(obj) {
	var i, key, other;
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		for(key in other)
			obj[key] = other[key];
	}
	return obj;
}

// Copy attributes into the first object argument (assumed to be a prototype) given a number of additional object arguments
// Same as extendObj but detects functions and chains them together from last to first
function _extendProto(proto) {
	var i, key, other, value, otherValue;
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		for(key in other) {
			value = proto[key];
			otherValue = other[key];
			if(typeof value === 'function' && typeof otherValue === 'function')
				proto[key] = _chain(otherValue, value);
			else
				proto[key] = other[key];
		}
	}
	return proto;
}

// Create a copy of obj and mixin the other arguments in order
// Works much like _.extend() but does a recursive merging of plain objects
// Good for creating and using view mixins
// Register mixins with Cord.mixins
function _mixObj(obj) {
	var i, key, value, other, otherValue;
	if(typeof obj === 'string')
		obj = Cord.mixins[obj] || {};
	obj = _copyObj(obj);
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		if(typeof other === 'string')
			other = Cord.mixins[other] || {};
		for(key in other) {
			value = obj[key];
			otherValue = other[key];
			if(_isPlainObj(value) && _isPlainObj(otherValue))
				obj[key] = _mixObj(value, otherValue);
			else if(typeof value === 'function' && typeof otherValue === 'function')
				obj[key] = _chain(value, otherValue);
			else
				obj[key] = otherValue;
		}
	}
	return obj;
}

// Get all values for a key on a prototype chain, ordered by parent values first
function _getPrototypeValuesForKey(objCls, key, isCls) {
	var proto = isCls ? objCls.prototype : Object.getPrototypeOf(objCls), values = [];
	for(; proto; proto = Object.getPrototypeOf(proto)) {
		if(proto.hasOwnProperty(key))
			values.unshift(proto[key]);
	}
	return values;
}

function _getFunctionArgs(func) {
	var str, args;
	if(func.args)
		return func.args;
	// Get all argument names for a function
	// Based on http://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically-from-javascript
	str = func.toString();
	if(/__args__/.test(str))
		args = func('__args__');
	else
		args = str.slice(str.indexOf('(') + 1, str.indexOf(')')).match(/([^\s,]+)/g);
	if(!args)
		args = [];
	return args;
}

// Add object utility functions
_extendObj(Cord, {
	isPlainObj: _isPlainObj,
	copyObj: _copyObj,
	extendObj: _extendObj,
	extendProto: _extendProto,
	mixObj: _mixObj,
	getPrototypeValuesForKey: _getPrototypeValuesForKey,
	getFunctionArgs: _getFunctionArgs,
	log: (debug ? function() {
		var format = [];
		var args = Array.prototype.slice.call(arguments);
		for(var i = 0; i < args.length; ++i)
			format.push((typeof args[i] === 'object') ? '%O' : '%s');
		args.unshift(format.join(' | '));
		console.log.apply(console, args);
	} : function(){})
});

/******************* Data binding object extensions *******************/

// Internal use only for when there are one or more subkeys to resolve on an object, view, or model
function _getObjValue(obj, keys) {
	var i, key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	for(i = 0; i < keys.length; ++i) {
		key = keys[i];
		if(obj.getValueForKey) {
			// If a namespace is included in the keys pass the pair (which is still a single key) to getValueForKey
			if(Cord.scopes[key.toLowerCase()] && ((i + 1) < keys.length)) {
				i += 1;
				key = key + '.' + keys[i];
			}
			obj = obj.getValueForKey(key);
		}
		else if(obj instanceof Backbone.Model) {
			obj = (key === 'id' ? obj.id : obj.get(key));
		}
		else if(obj) {
			if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
				obj = Cord.decodeValue(obj);
			else
				obj = obj[key];
		}
	}
	return obj;
}

function _setObjValue(obj, keys, value) {
	var key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	obj = _getObjValue(obj, keys.slice(0, -1));
	key = keys[keys.length - 1];
	if(obj.setValueForKey) {
		obj.setValueForKey(key, value);
	}
	else if(obj instanceof Backbone.Model) {
		obj.set((key === 'id' ? obj.idAttribute : key), value);
	}
	else if(obj) {
		if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
			Cord.encodeValue(obj, value);
		else
			obj[key] = value;
	}
}

// A simple event callback, where the last argument is taken as a value to pass into setValueForKey
var _createSetValueCallback = Cord.createSetValueCallback = function(keyPath) {
	return function() {
		this.setValueForKey(keyPath, arguments[arguments.length - 1]);
	};
};

function _applyFilters(func, filters) {
	return function(key, value) {
		for(var i = 0; i < filters.length; ++i)
			value = filters[i](value);
		return func.call(this, key, value);
	};
}
function _applyNegation(func) {
	return function(key, value) {
		func.call(this, key, !Cord.convertToBool(value));
	};
}
function _applySubkeys(func, keys) {
	return function(key, value) {
		return func.call(this, key, _getObjValue(value, keys));
	};
}

Cord.Binding = {
	// Do not externally modify the array or object returned from this method
	// An empty array or object are returned when no observers exist
	// key argument is optional
	// create is also optional and if true will interally create the observer array or object as needed
	_getObservers: function(namespace, key, create) {
		var observers;
		// In some cases it is possible for observer functions to run after remove - just return empty
		if(this._observers === null)
			return key ? [] : {};
		namespace = namespace.toLowerCase();
		observers = this._observers[namespace];
		if(!observers) {
			observers = {};
			if(create)
				this._observers[namespace] = observers;
		}
		if(key) {
			if(!observers[key]) {
				if(create)
					observers = observers[key] = [];
				else
					observers = [];
			}
			else {
				observers = observers[key];
			}
		}
		return observers;
	},

	_hasObservers: function(namespace, key) {
		var observers = this._getObservers(namespace, key);
		if(Array.isArray(observers))
			return !!observers.length;
		return !!Object.keys(observers).length;
	},

	_addObserver: function(namespace, key, observer) {
		var observers = this._getObservers(namespace, key, true);
		observers.push(observer);
	},

	_removeObserver: function(namespace, key, observer) {
		var observers = this._getObservers(namespace);
		if(observers[key]) {
			var index = observers[key].indexOf(observer);
			if(index !== -1) {
				observers[key].splice(index, 1);
				if(!observers[key].length)
					delete observers[key];
			}
		}
	},

	_invokeObservers: function(namespace, key, value) {
		Cord.log(namespace, key, value);
		var i, observers = this._getObservers(namespace, key);
		for(i = 0; i < observers.length; ++i)
			observers[i].call(this, key, value);
		return this;
	},

	observe: function(key, observer, immediate) {
		var path, namespace, scope;
		if(typeof observer === 'string')
			observer = this[observer] || _createSetValueCallback(observer);
		if(typeof observer !== 'function')
			return this;
		// If key starts with ! then apply a negation
		if(key[0] === '!') {
			key = key.substr(1);
			observer = _applyNegation(observer);
		}
		// Apply any filters to the observer function
		if(key.indexOf('|') !== -1) {
			var i, filters = [], names = key.split('|');
			key = names[0].trim();
			for(i = 1; i < names.length; ++i)
				filters.push(Cord.filters[names[i].trim()] || Math[names[i].trim()]);
			observer = _applyFilters(observer, filters);
		}
		// If key starts with %, just do an immediate timeout with the getValue
		// Doesn't include the key on callback since this is used only for binding straight to some output
		if(key[0] === '%') {
			key = key.substr(1);
			observer.call(this, null, this.getValueForKey.call(this, key));
			return this;
		}
		path = Cord.parseKeyPath(key);
		namespace = path[0];
		key = path[1];
		scope = Cord.scopes[namespace];
		// Support any subkeys but only changes to the top-level key are observed
		if(path.length > 2)
			observer = _applySubkeys(observer, path.slice(2));
		// Add the observer
		scope.observe.call(this, key, observer, immediate);
		this._addObserver(namespace, key, observer);
		if(immediate)
			observer.call(this, key, scope.getValue.call(this, key));
		return this;
	},

	unobserve: function(key, observer) {
		var path, namespace, scope;
		if(typeof observer === 'string')
			observer = this[observer];
		if(!observer)
			return this;
		path = Cord.parseKeyPath(key);
		namespace = path[0];
		key = path[1];
		scope = Cord.scopes[namespace];
		// Remove the observer
		this._removeObserver(namespace, key, observer);
		scope.unobserve.call(this, key, observer);
		return this;
	},

	stopObserving: function() {
		var namespace, scope;
		for(namespace in this._observers) {
			scope = Cord.scopes[namespace];
			if(scope.stop)
				scope.stop.call(this);
		}
		this._observers = null;
	},

	getValueForKey: function(keyPath) {
		var path, scope, value;
		path = Cord.parseKeyPath(keyPath);
		scope = Cord.scopes[path[0]];
		value = scope.getValue.call(this, path[1]);
		if(path.length > 2)
			value = _getObjValue(value, path.slice(2));
		return value;
	},

	setValueForKey: function(keyPath, value) {
		var path, scope;
		path = Cord.parseKeyPath(keyPath);
		scope = Cord.scopes[path[0]];
		// Use _setObjValue with subkeys, code is optimized with the first getValue, also valid is: _setObjValue(this, path, value);
		if(path.length > 2)
			_setObjValue(scope.getValue.call(this, path[1]), path.slice(2), value);
		else
			scope.setValue.call(this, path[1], value);
		return this;
	},

	setValuesForKeys: function(values) {
		var i, key;
		if(_isPlainObj(values)) {
			for(key in values)
				this.setValueForKey(key, values[key]);
		}
		else {
			for(i = 0; (i + 1) < arguments.length; i += 2)
				this.setValueForKey(arguments[i], arguments[i + 1]);
		}
		return this;
	},

	// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
	model: Cord.EmptyModel,

	// Built-in observer for all changes on the model
	_modelObserver: function(model, options) {
		var key, changed = options._changed || model.changedAttributes();
		if(!changed)
			return;
		for(key in changed)
			this._invokeObservers('model', key, changed[key]);
	},

	// setModel will change the model a View has and invoke any observers
	// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
	// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
	setModel: function(newModel) {
		var key, current, observers;
		if(this.model === newModel)
			return this;
		if(!newModel)
			newModel = Cord.EmptyModel;
		if(!(newModel instanceof Backbone.Model))
			throw new Error('Attempting to assign a non-Backbone.Model to View.model.');
		current = this.model;
		this.model = newModel;
		this.stopListening(current);
		this.listenTo(this.model, 'change', this._modelObserver);
		// Detect the changes and invoke observers
		observers = this._getObservers('model');
		if(Object.keys(observers).length) {
			// Invoke all observers if the model is the empty model
			if(this.model === Cord.EmptyModel) {
				for(key in observers)
					this._invokeObservers('model', key, void(0));
			}
			else {
				this._modelObserver(this.model, {_changed: current.changedAttributes(this.model.attributes)});
			}
		}
		return this;
	},

	// setCollection provided as a convention for plugins to wrap
	// NOTE: View.prototype.collection is set to EmptyCollection only in the collection mixin
	setCollection: function(newCollection) {
		if(this.collection === newCollection)
			return this;
		if(!newCollection)
			newCollection = Object.getPrototypeOf(this).collection;
		if(!(newCollection instanceof Backbone.Collection))
			throw new Error('Attempting to assign a non-Backbone.Collection to View.collection.');
		if(this.collection)
			this.stopListening(this.collection);
		this.collection = newCollection;
		return this;
	}
};

// Extend the View class with binding capabilities
_extendObj(View.prototype, Cord.Binding);

// Built-in model scope that simply wraps access to the model, the model listening for observing is managed by setModel()
Cord.scopes.model = {
	observe: function(key, observer) {
		if(key === 'id')
			this._addObserver('model', this.model.idAttribute, observer);
	},
	unobserve: function(key, observer) {
		if(key === 'id')
			this._removeObserver('model', this.model.idAttribute, observer);
	},
	getValue: function(key) {
		if(key === 'id')
			return this.model.id;
		return this.model.get(key);
	},
	setValue: function(key, value) {
		if(key === 'id')
			key = this.model.idAttribute;
		this.model.set(key, value);
	}
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var View = Cord.View;

var isPlainObj = Cord.isPlainObj;
var extendObj = Cord.extendObj;
var copyObj = Cord.copyObj;
var mixObj = Cord.mixObj;
var getPrototypeValuesForKey = Cord.getPrototypeValuesForKey;
var createSetValueCallback = Cord.createSetValueCallback;

extendObj(Cord, {
	config: {
		idProperties: true,
		prefixCreateElement: false
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	_sid: 1,
	_pluginsChecked: false,
	// NOTE: classes, attrs, children, and bindings are all copies and may be modified by plugins without side-effects
	// modifications will be recognized by the default behavior and returning the copy is not necessary
	_callbacks: {
		// (el) tag can process the tag value and return an element overriding the default createElement
		tag: [],
		// (el and subview) classes is an array of classname, returning [] will prevent default classes being applied
		classes: [],
		// (el conditionally invoked) attrs is a dict, returning {} will prevent default attrs being applied
		attrs: [],
		// (el conditionally invoked) children is an array of strings or dom elements
		children: [],
		// (subview) bindings that by default get converted to event listeners
		bindings: [],
		// (el and subview) when creation and setup is complete, right before el and subview return, returning a different element can replace an el
		complete: [],
		// View Class extending only, where this is the parent class and context has protoProps and staticProps arguments
		extend: [],
		// (new View) create, initialize, and remove apply to all views
		create: [],
		initialize: [],
		remove: []
	}
});

Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(!Cord.config.hasOwnProperty(setting))
				Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Cord._callbacks) {
		if(typeof plugin[callback] === 'function')
			fnc.call(Cord._callbacks[callback], plugin[callback]);
	}
	return fnc.call(this, plugin);
};
Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

function _callPlugins(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Cord._callbacks[name];
	var args = Array.prototype.slice.call(arguments, 1);
	delete context[name];
	for(var i = 0; i < callbacks.length; ++i) {
		context[name] = callbacks[i].apply(this, args) || context[name];
	}
	return context[name];
}

// Generate an arbitrary DOM node given a tag[id][classes] string, [attributes] dictionary, and [child nodes...]
// If #id is given it must appear before the .classes, e.g. #id.class1.class2 or span#id.class1.class2
function _createElement(tagIdClasses, attrs) {
	if(Cord._viewContext && this !== Cord._viewContext)
		return _createElement.apply(Cord._viewContext, arguments);
	if(typeof tagIdClasses !== 'string') {
		var component = tagIdClasses;
		// A function with an extend method will be a Backbone view
		if(typeof component === 'function' && !(component.prototype instanceof Backbone.View)) {
			var args = Array.prototype.slice.call(arguments, 1);
			// When attrs (args[0]) is null, is a child, else just copy
			if(!args[0])
				args[0] = {};
			else if(!isPlainObj(args[0]))
				args.unshift({});
			else
				args[0] = copyObj(args[0]);
			args[0].children = (args.length > 2) ? args.slice(1) : args[1];
			if(Cord.config.prefixCreateElement)
				args.unshift(this._createElement);
			return component.apply(this, args);
		}
		else {
			return _createSubview.apply(this, arguments).el;
		}
	}
	tagIdClasses = tagIdClasses.split('.');
	var context = { isView: this instanceof View };
	var tagId = tagIdClasses[0].split('#');
	var tag = tagId[0] || 'div';
	var el = context.el = this._callPlugins('tag', context, tag) || document.createElement(tag);
	var id = context.id = tagId[1] || (attrs && attrs.id);
	if(id)
		Cord.setId(el, id, this.vuid);
	var classes = tagIdClasses.slice(1);
	if(!classes.length && (attrs && attrs.className))
		classes = attrs.className.split(' ');
	Cord.addClass(el, this._callPlugins('classes', context, classes) || classes);
	if(arguments.length > 1) {
		// If attrs is not the start of children, then apply the dictionary as attributes
		var i = 1;
		if(!(typeof attrs === 'string' || attrs instanceof Backbone.View || attrs instanceof Node)) {
			i = 2;
			// Copy attrs to prevent side-effects
			attrs = copyObj(attrs);
			delete attrs.id; delete attrs.className;
			if(attrs.htmlFor) {
				attrs['for'] = attrs.htmlFor;
				delete attrs.htmlFor;
			}
			attrs = this._callPlugins('attrs', context, attrs) || attrs;
			for(var attr in attrs)
				el.setAttribute(attr, attrs[attr]);
		}
		// Copy arguments to prevent side-effects
		var child, children = Array.prototype.slice.call(arguments, i);
		if(Array.isArray(children[0]))
			children = children[0];
		children = this._callPlugins('children', context, children) || children;
		for(i = 0; i < children.length; ++i) {
			child = children[i];
			if(typeof child === 'string')
				el.appendChild(document.createTextNode(child));
			else if(child instanceof Backbone.View)
				el.appendChild(child.el);
			else
				el.appendChild(child);
		}
	}
	if(Cord.config.idProperties && context.isView && id && Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	return this._callPlugins('complete', context) || el;
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _createSubview(instanceClass, bindings, keyValues) {
	var id, classes, subview, context, callback;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Set the subview's model
	if(this.model !== Cord.EmptyModel && subview.model === Cord.EmptyModel && !subview.collection && subview instanceof View) {
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof View, subview: subview };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(bindings) {
		id = context.id = bindings.id;
		if(id && !Cord.hasId(subview.el))
			Cord.setId(subview.el, id, this.vuid);
		if(bindings.className) {
			classes = bindings.className.split(' ');
			Cord.addClass(subview.el, this._callPlugins('classes', context, classes) || classes);
		}
		// Copy bindings to prevent side-effects
		bindings = copyObj(bindings);
		delete bindings.id; delete bindings.className;
		bindings = this._callPlugins('bindings', context, bindings) || bindings;
		for(var e in bindings) {
			callback = (typeof bindings[e] === 'string') ? (this[bindings[e]] || createSetValueCallback(bindings[e])) : bindings[e];
			if(typeof callback === 'function') {
				if(subview.properties && subview.properties.hasOwnProperty(e))
					subview.observe(e, callback.bind(this));
				else
					this.listenTo(subview, e, callback);
			}
		}
	}
	if(keyValues)
		subview.setValuesForKeys(keyValues);
	subview.sid = Cord._sid;
	Cord._sid += 1;
	subview.el.setAttribute('data-sid', subview.sid);
	this.subviews[subview.sid] = subview;
	this.listenToOnce(subview, 'remove', function(subview) {
		this.stopListening(subview);
		delete this.subviews[subview.sid];
	});
	// Simply returns getSubviewById so that the property doesn't have another strong reference to the view that would also need to be cleaned up
	if(Cord.config.idProperties && context.isView && id && Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getSubviewById(id); },
			set: function(value) {
				var el, current;
				if(!(value instanceof Backbone.View))
					throw new Error('Attempting to assign a non-Backbone.View to a subview.');
				// Add the new subview and remove the old from the DOM
				el = value.el;
				current = this.getSubviewById(id);
				current.el.parentNode.replaceChild(el, current.el);
				current.remove();
				// If the new subview doesn't have an sid it needs to get setup, but without bindings or keyValues
				if(!value.sid)
					this.createSubview(value);
				// Reapply the id or remove the old property if a different id is used
				if(!Cord.hasId(el))
					Cord.setId(el, id, this.vuid);
				else if(id !== Cord.getId(el))
					delete this[id];
			},
			enumerable: true,
			configurable: true
		});
	}
	this._callPlugins('complete', context);
	return subview;
}

function _createText(str) {
	return document.createTextNode(str);
}

function _render(element, container) {
	if(typeof element === 'function')
		element = (element.prototype instanceof Backbone.View) ? (new element()).el : element();
	else if(element instanceof Backbone.View)
		element = element.el;
	else if(typeof element === 'string')
		element = this.createText(element);
	else if(!(element instanceof Node))
		element = this.createElement(element);
	if(typeof container === 'string')
		container = document.querySelector(container);
	container.appendChild(element);
}

function _replace(child, element, container) {
	if(child === element)
		return;
	if(typeof container === 'string')
		container = document.querySelector(container);
	if(child) {
		if(child instanceof Backbone.View)
			child.remove();
		else
			container.removeChild(child);
	}
	this.render(element, container);
}

// Add layout creation methods that should be bound to allow importing of each individually
extendObj(Cord, {
	createElement: _createElement.bind(Cord),
	createText: _createText.bind(Cord),
	render: _render.bind(Cord),
	replace: _replace.bind(Cord),
	_callPlugins: _callPlugins
});
Cord.h = Cord.createElement;

extendObj(Cord.regex, {
	idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
	idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
});

Cord.hasId = function(el) {
	return !!el.getAttribute('data-id');
};
Cord.getId = function(el) {
	return el.getAttribute('data-id').split('-')[0];
};
Cord.setId = function(el, id, vuid) {
	el.setAttribute('data-id', id + (vuid ? ('-' + vuid) : ''));
};

Cord.regex.replaceIdSelectors = function(query, vuid) {
	return query.replace(this.idSelectorValues, '[data-id="$1' + (vuid ? ('-' + vuid) : '') + '"]');
};
Cord.regex.testIdProperty = function(id, noThrow) {
	var result = this.idPropertyTest.test(id);
	if(!result && !noThrow)
		throw new Error('Invalid id "' + id + '" used');
	return result;
};

// Expose createElement and createSubview on the View object as well
// _callPlugins is added because this._callPlugins is used for callbacks
View.prototype.createElement = _createElement;
View.prototype.createSubview = _createSubview;
View.prototype.createText = _createText;
View.prototype._callPlugins = _callPlugins;

// Built-in view property scope for observing view properties
// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
		if(this['_' + key] === value)
			return;
		if(prevSet)
			prevSet.call(this, value);
		else
			this['_' + key] = value;
		this._invokeObservers('this', key, this[key]);
	};
	newSet._cordWrapped = true;
	newSet._prevSet = prevSet;
	return newSet;
}
Cord.scopes.this = {
	observe: function(key) {
		var prop = Object.getOwnPropertyDescriptor(this, key);
		if(!prop)
			return;
		if(!prop.set._cordWrapped) {
			if(prop.set) {
				// Just wrap the setter of a defined property
				Object.defineProperty(this, key, {set: _propertyObserver(key, prop.set)});
			}
			else {
				// Define a new property without an existing defined setter
				this['_' + key] = this[key];
				if(delete this[key]) {
					Object.defineProperty(this, key, {
						get: this._synthesizeGetter(key),
						set: _propertyObserver(key),
						enumerable: true,
						configurable: true
					});
				}
			}
		}
	},
	unobserve: function(key) {
		if(!this._hasObservers('this', key)) {
			var prop = Object.getOwnPropertyDescriptor(this, key);
			if(prop.set._prevSet) {
				// Unwrap the previous set method
				Object.defineProperty(this, key, {set: prop.set._prevSet});
			}
			else {
				// Convert the property back to a normal attribute
				var value = this[key];
				delete this[key];
				this[key] = value;
			}
		}
	},
	getValue: function(key) {
		return this[key];
	},
	setValue: function(key, value) {
		this[key] = value;
	}
};
View.prototype._synthesizeGetter = function(key) {
	key = '_' + key;
	return function() { return this[key]; };
};
View.prototype._synthesizeSetter = function(key) {
	key = '_' + key;
	return function(value) { this[key] = value; };
};
View.prototype._synthesizeReadonlySetter = function(key) {
	key = '_' + key;
	return function(value) {
		if(typeof value === 'object' && Object.getPrototypeOf(value) === Cord.ForceValue.prototype)
			this[key] = value.value;
		else
			throw new Error('Attempting to assign a readonly property.');
	};
};
// Synthesize and define a property using a simple definition, which is one or more of (get, set, value, readonly)
// When definition is a function it implies {get: definition}
// When definition is just a value it implies {value: definition} - plain objects need to be explicity set under the value key
// When get or set is missing default accessors that read/write the backing _key are used
// When set is null or readonly is true - a readonly property is created that throws an exception when trying to assign
// Readonly properties are publicly readonly but privately writeable by assigning values with the ForceValue object
View.prototype._synthesizeProperty = function(key, definition) {
	var value = null;
	var readonly = false;
	var descriptor = { configurable: true, enumerable: true };
	if(typeof definition === 'function') {
		descriptor.get = definition;
	}
	else if(isPlainObj(definition)) {
		value = definition.value;
		readonly = definition.readonly;
		descriptor.get = definition.get;
		descriptor.set = definition.set;
	}
	else {
		value = definition;
	}
	descriptor.get = descriptor.get || this._synthesizeGetter(key);
	descriptor.set = (descriptor.set === null || readonly) ? this._synthesizeReadonlySetter(key) : descriptor.set || this._synthesizeSetter(key);
	Object.defineProperty(this, key, descriptor);
	Object.defineProperty(this, '_' + key, {configurable: false, enumerable: false, value: value, writable: true});
};

View.prototype.getChildById = function(id) {
	return this.el.querySelector('[data-id="' + id + '-' + this.vuid + '"]');
};
View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
};

function _terminate(f, key) { return function() { var ret = f.apply(this, arguments); var parent = Object.getPrototypeOf(Object.getPrototypeOf(this)); return (parent && parent[key]) ? parent[key].apply(this, arguments) : ret || this; }; }

// Same as _mixObj, but will terminate (call parent) any function chains if the last (terminal) obj did not implement the function
function _mixProtoProps() {
	var key, value, obj = mixObj.apply(this, arguments);
	var terminal = arguments[arguments.length - 1];
	if(typeof terminal === 'string')
		terminal = Cord.mixins[terminal] || {};
	for(key in obj) {
		value = obj[key];
		if(typeof value === 'function' && typeof terminal[key] !== 'function')
			obj[key] = _terminate(value, key);
	}
	return obj;
}

var __extend = View.extend;
View.extend = function(protoProps, staticProps) {
	protoProps = protoProps || {};
	staticProps = staticProps || {};
	if(protoProps.mixins) {
		var mixArgs = protoProps.mixins;
		delete protoProps.mixins;
		mixArgs.push(protoProps);
		protoProps = _mixProtoProps.apply(Cord, mixArgs);
	}
	// Create a unique view id for this view class. Can set a static vuid for debugging
	protoProps.vuid = protoProps.vuid || Cord.randomUID() + Cord.randomUID();
	// Call all of the plugins
	_callPlugins.call(this, 'extend', {protoProps: protoProps, staticProps: staticProps});
	// Replace all of the id selectors in the event delegation
	var key, value, events = protoProps.events;
	if(events) {
		for(key in events) {
			if(key.indexOf('#') !== -1) {
				value = events[key];
				delete events[key];
				key = Cord.regex.replaceIdSelectors(key, protoProps.vuid);
				events[key] = value;
			}
		}
	}
	// Inherit parent events, properties, and observers - only need to worry about direct inheritance as inheritance builds on itself
	if(this.prototype.events && protoProps.events)
		protoProps.events = mixObj(this.prototype.events, protoProps.events);
	if(this.prototype.properties && protoProps.properties)
		protoProps.properties = mixObj(this.prototype.properties, protoProps.properties);
	if(this.prototype.observers && protoProps.observers)
		protoProps.observers = mixObj(this.prototype.observers, protoProps.observers);
	return __extend.call(this, protoProps, staticProps);
};

var __setModel = View.prototype.setModel;
View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview;
	current = this.model;
	__setModel.apply(this, arguments);
	if(!noCascade) {
		for(key in this.subviews) {
			subview = this.subviews[key];
			// Do not cascade if the subview is not a Cord View or is intercepted by a cascade method
			if(!(subview instanceof View))
				continue;
			if(subview.cascade && subview.cascade(newModel) === false)
				continue;
			if(subview.model === current && !subview.collection)
				subview.setModel(newModel);
		}
	}
	return this;
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = View.prototype._ensureElement;
View.prototype._ensureElement = function() {
	if(!Cord._pluginsChecked) {
		Cord.plugins._check();
		Cord._pluginsChecked = true;
	}
	// If model or collection is provided as a class in the prototype, then create a new instance
	// This ensures availability on creating the layout but the fetch will need to be started by the View
	var proto = Object.getPrototypeOf(this);
	if(typeof proto.collection === 'function')
		this.collection = new proto.collection();
	else if(typeof proto.model === 'function')
		this.model = new proto.model();
	this.subviews = {};
	this._observers = {};
	// Run plugin create hooks
	this._callPlugins('create', {});
	// Synthesize any declared properties
	var key;
	if(this.properties) {
		var properties = this.properties;
		for(key in properties)
			this._synthesizeProperty(key, properties[key]);
	}
	// Bind the el method with prefixed args
	// _createElement is added to override Backbone's _createElement when el is not a function
	this._createElement = this.createElement.bind(this);
	if(typeof this.el === 'function' && Cord.config.prefixCreateElement)
		this.el = this.el.bind(this, this._createElement);
	// Start listening to the model
	if(this.model !== Cord.EmptyModel)
		this.listenTo(this.model, 'change', this._modelObserver);
	// Use backbone to actually create the element
	var ret, prevContext = Cord._viewContext;
	Cord._viewContext = this;
	try {
		ret = __ensureElement.apply(this, arguments);
	}
	finally {
		Cord._viewContext = prevContext;
	}
	// Travel the prototype chain and apply all the classNames found, join into a single space separated string because some values might be space separated
	Cord.addClass(this.el, getPrototypeValuesForKey(this, 'className').join(' '));
	this.el.setAttribute('data-vuid', this.vuid);
	// Run plugin initializers
	this._callPlugins('initialize', {});
	// Setup any declared observers
	if(this.observers) {
		var observers = this.observers;
		for(key in observers)
			this.observe(key, observers[key], false);
	}
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = View.prototype.remove;
View.prototype.remove = function() {
	var key;
	this._callPlugins('remove', {});
	for(key in this.subviews)
		this.subviews[key].remove();
	this.subviews = null;
	// Stop all current observers
	this.stopObserving();
	this.trigger('remove', this);
	// Backbone's remove will call stopListening(), which will provide extra cleanup and be sufficient also for some scopes
	return __remove.apply(this, arguments);
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var getFunctionArgs = Cord.getFunctionArgs;

function _detectComputedChanges() {
	var i, key, keys;
	var change, changed = this.changedAttributes();
	var newChanged = {};
	for(change in changed) {
		if(this._computedArgs[change]) {
			keys = this._computedArgs[change];
			for(i = 0; i < keys.length; ++i) {
				key = keys[i];
				if(!newChanged[key]) {
					newChanged[key] = this.get(key);
					this.trigger('change:' + key, this, newChanged[key], {});
				}
			}
		}
	}
	// To not interefer with the current change event, use setImmediate to modify the changed object
	Cord.setImmediate(function() {
		this.changed = newChanged;
		this.trigger('change', this, {});
	}.bind(this), 0);
}

function _wrapComputedFunc(func, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.get(args[i]));
		return func.apply(this, values);
	};
}

// Extend computed attribute capabilities to Backbone models
Model.prototype._addComputed = function(key, func) {
	var __get, i, arg, args = getFunctionArgs(func);
	if(!this._computed) {
		this._computed = {};
		this._computedArgs = {};
		__get = this.get;
		this.get = function(attr) {
			var compFun = this._computed[attr];
			if(compFun)
				return compFun.call(this);
			return __get.call(this, attr);
		};
		this.listenTo(this, 'change', _detectComputedChanges);
	}
	this._computed[key] = _wrapComputedFunc(func, args);
	for(i = 0; i < args.length; ++i) {
		arg = args[i];
		if(!this._computedArgs[arg])
			this._computedArgs[arg] = [];
		this._computedArgs[arg].push(key);
	}
};

// Wrap extend to wrap the initialize method
var __extend = Model.extend;
Model.extend = function(properties) {
	var __initialize;
	if(properties.computed) {
		__initialize = properties.initialize || Model.prototype.initialize;
		properties.initialize = function() {
			if(this.computed) {
				for(var attr in this.computed)
					this._addComputed(attr, this.computed[attr]);
			}
			return __initialize.apply(this, arguments);
		};
	}
	return __extend.apply(this, arguments);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var mixObj = Cord.mixObj;

var namedPart = /(\(\?)?:\w+/g;
var splatPart = /\*\w+/g;
var normalPart = /\w+/g;

Cord.Router = Backbone.Router.extend({
	route: function(route, name, callback)  {
		var i, match, part, parts = route.split('/');
		var key = this.key;
		var components = {};
		var params = {};
		for(i = 0; i < parts.length; ++i) {
			part = parts[i];
			if(!part.length)
				continue;
			match = part.match(namedPart) || part.match(splatPart);
			if(match) {
				params[i] = match[0].substr(1);
			}
			else {
				match = part.match(normalPart);
				if(match) {
					components[key] = match[0];
					key = 'sub' + key;
				}
			}
		}
		if(typeof name === 'function') {
			callback = name;
			name = '';
		}
		return Backbone.Router.prototype.route.call(this, route, name, this.wrapCallback(name, callback, components, params));
	},
	wrapCallback: function(name, callback, components, params) {
		// components is a mapping of keys: component values, params is a mapping of argument index positions (0, 1, 2 etc.) to key names
		return function() {
			var i, values = {};
			var model = Cord.UnmanagedScopes.route;
			var existingKeys = Object.keys(model.attributes);
			// null all current values
			for(i = 0; i < existingKeys.length; ++i)
				values[existingKeys[i]] = null;
			// set the name of the current route
			values.name = name || '';
			// add in the named params of the route - unmatched params are null, also appears last argument is also null
			for(i = 0; i < arguments.length; ++i) {
				if(arguments[i] !== null)
					values[params[i]] = arguments[i];
			}
			// add in the components of the path
			values = mixObj(values, components);
			// invoke observers by setting the model and then do the callback if provided
			model.set(values);
			if(callback)
				return callback.apply(this, arguments);
		};
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var ForceValue = Cord.ForceValue;

Cord.mixins.collection = {
	collection: Cord.EmptyCollection,
	properties: {
		length: {
			readonly: true,
			value: 0
		},
		start: function(length, pageStart, pageLength) {
			var start = 0;
			if(pageStart > 0)
				start = pageStart;
			if(start > length)
				start = length;
			if(!pageLength)
				start = 0;
			return start;
		},
		end: function(start, length, pageStart, pageLength) {
			var end = length - 1;
			if(pageLength > 0)
				end = start + pageLength - 1;
			if(end >= length)
				end = length - 1;
			if(!pageLength)
				end = -1;
			return end;
		},
		more: function(end, length) {
			return length - (end + 1);
		},
		pageStart: {
			set: function(value) {
				this._pageStart = value;
				this._onResetCollection();
			},
			value: 0
		},
		pageLength: {
			set: function(value) {
				this._pageLength = value;
				this._onResetCollection();
			},
			value: -1
		},
		selected: {
			set: function(model) {
				var currentView;
				if(this._selected === model)
					return;
				this._selected = model;
				this.setModel(model);
				this.trigger('select', model);
				currentView = this.itemViews._selected;
				if(currentView)
					currentView.selected = false;
				if(model) {
					currentView = this.itemViews[model.cid];
					this.itemViews._selected = currentView;
					currentView.selected = true;
				}
				else {
					delete this.itemViews._selected;
				}
			},
			value: null
		}
	},
	initialize: function() {
		// Call setCollection to setup the listeners
		this.setCollection(this.collection, true);
	},
	remove: function() {
		// Cleanup first by removing all of the items
		this._removeAllItems();
	},
	setCollection: function(newCollection, init) {
		// Setup event listeners on the collection
		if(this.collection !== newCollection || init) {
			if(newCollection) {
				this.listenTo(newCollection, 'add', this._onAddItem);
				this.listenTo(newCollection, 'remove', this._onRemoveItem);
				this.listenTo(newCollection, 'sort', this._onSortCollection);
				this.listenTo(newCollection, 'reset', this._onResetCollection);
			}
			// Reset everything after the parent setCollection actually sets this.collection
			Cord.setImmediate(this._onResetCollection.bind(this));
		}
	},
	getCollectionContainer: function() {
		// Look for a child with the container id, but default to the view's el
		return this.getChildById(Cord.config.collectionContainerId) || this.el;
	},
	createItemView: function(model) {
		var view = new this.itemView({model: model});
		if(view.sid)
			throw new Error('Item views cannot be passed or created through the subview() method.');
		// Listen to select events from itemView, which will proxy trigger a select even on this view
		this.listenTo(view, 'select', function(view) {
			this.selected = view.model;
		});
		// If the itemView calls remove() on itself then remove the corresponding model
		this.listenTo(view, 'remove', function(view) {
			this.collection.remove(view.model, {viewRemoved: true});
		});
		this.itemViews[view.model.cid] = view;
		return view;
	},
	getItemView: function(indexModelElement) {
		var key, cid;
		// First assume argument is a model
		cid = indexModelElement.cid;
		// Check for the argument for index, otherwise check for element
		if(typeof indexModelElement === 'number') {
			var model = this.collection.at(indexModelElement);
			if(model)
				cid = model.cid;
		}
		else if(indexModelElement.nodeType === Node.ELEMENT_NODE) {
			for(key in this.itemViews) {
				if(this.itemViews[key].el === indexModelElement) {
					cid = key;
					break;
				}
			}
		}
		return (cid ? this.itemViews[cid] : void(0));
	},
	_removeAllItems: function() {
		// Cleanup on remove and the first part of _onResetCollection()
		var cid, view;
		if(this.itemViews) {
			delete this.itemViews._first;
			delete this.itemViews._selected;
			for(cid in this.itemViews) {
				view = this.itemViews[cid];
				this.stopListening(view);
				view.remove();
			}
		}
		this.itemViews = {};
		this.selected = null;
	},
	_onAddItem: function(model, collection, options) {
		var view, container, sibling, index;
		this.length = new ForceValue(collection.length);
		container = this.getCollectionContainer();
		if(!container)
			return;
		index = options.index === void(0) ? this._length - 1 : options.index;
		// If the index does not fall between start and end, then return
		if(index < this._start || index > this._end)
			return;
		// Normalize the index to the page
		index = index - this._start;
		// If the page is full and will overflow, remove the last child
		if((this._end - this._start) + 1 === this._pageLength)
			container.removeChild(container.lastChild);
		view = this.createItemView(model);
		if(index === this._end) {
			container.appendChild(view.el);
		}
		else {
			sibling = this.itemViews[collection.at(this._start + index + 1).cid].el;
			sibling.parentNode.insertBefore(view.el, sibling);
		}
		if(index === 0)
			this.itemViews._first = view;
	},
	_onRemoveItem: function(model, collection, options) {
		var view, container;
		var more = this._more;
		this.length = new ForceValue(collection.length);
		container = this.getCollectionContainer();
		if(!container)
			return;
		if(this._selected === model)
			this.selected = null;
		view = this.itemViews[model.cid];
		if(view) {
			delete this.itemViews[model.cid];
			// Stop listening to prevent the remove event on the itemView
			// and remove the actual view only if the itemView did not remove() itself
			this.stopListening(view);
			if(!options.viewRemoved)
				view.remove();
			if(options.index >= this._start && options.index <= this._end && more) {
				// A new node needs to be added at the end of the page
				view = this.createItemView(collection.at(this._end));
				container.appendChild(view.el);
			}
			if(collection.length)
				this.itemViews._first = this.itemViews[collection.at(this._start).cid];
			else
				delete this.itemViews._first;
		}
	},
	_onSortCollection: function() {
		var i, key, model, view, child, container;
		container = this.getCollectionContainer();
		if(!container || !this._length)
			return;
		if(this._start === 0 && this._end === this._length - 1) {
			// There is no paging, all items are already in the DOM, just need to reorder the items
			child = this.itemViews._first.el;
			for(i = 0; i < this._length; ++i) {
				model = this.collection.at(i);
				view = this.itemViews[model.cid];
				container.insertBefore(view.el, child);
				child = view.el.nextSibling;
			}
			this.itemViews._first = this.itemViews[this.collection.at(0).cid];
		}
		else {
			var itemRemoval = {}; // Copy of hash of model ids, that get removed as resused
			var keys = Object.keys(this.itemViews);
			for(i = 0; i < keys.length; ++i)
				itemRemoval[keys[i]] = true;
			itemRemoval._first = false;
			itemRemoval._selected = false;
			// Create or flag existing views for reuse
			for(i = this._start; i <= this._end; ++i) {
				key = this.collection.at(i).cid;
				if(this.itemViews[key])
					itemRemoval[key] = false;
				else
					this.itemViews[key] = this.createItemView(this.collection.at(i));
			}
			// Loop over itemRemoval and remove views
			for(key in itemRemoval) {
				if(itemRemoval[key]) {
					view = this.itemViews[key];
					if(this._selected === view.model)
						this.selected = null;
					delete this.itemViews[key];
					this.stopListening(view);
					view.remove();
				}
			}
			// Loop over the models and pull from new and existing views
			for(i = this._start; i <= this._end; ++i) {
				view = this.itemViews[this.collection.at(i).cid];
				container.appendChild(view.el);
			}
			this.itemViews._first = this.itemViews[this.collection.at(this._start).cid];
		}
	},
	_onResetCollection: function() {
		// When resetting, no other add, remove, or update events are triggered
		var i, view, fragment, container;
		this._removeAllItems();
		this.length = new ForceValue(this.collection.length);
		container = this.getCollectionContainer();
		if(!container || !this._length)
			return;
		fragment = document.createDocumentFragment();
		for(i = this._start; i <= this._end; ++i) {
			view = this.createItemView(this.collection.at(i));
			if(i === this._start)
				this.itemViews._first = view;
			fragment.appendChild(view.el);
		}
		container.appendChild(fragment);
	}
};

Cord.plugins.push({
	name: 'collection',
	requirements: ['computed'],
	config: {
		collectionContainerId: 'itemContainer'
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var Collection = Cord.Collection;
var ForceValue = Cord.ForceValue;

// Default parseError method, Simply read the http status
Cord.parseError = Cord.parseError || function(response) {
	return response.status;
};

function _setValues(progress, syncing, error, modelCollection, response, options) {
	error = error && Cord.parseError(response, options);
	if(this.setValueForKey) {
		this.setValueForKey('syncProgress', new ForceValue(progress));
		this.setValueForKey('syncing', new ForceValue(syncing));
		this.setValueForKey('syncError', new ForceValue(error));
	}
	else {
		this.syncProgress = progress;
		this.syncing = syncing;
		this.syncError = error;
	}
}

// Notes on events:
// request (when fetch starts)
// sync (when sync has finished successfully, fetch, save, and destroy)
// error (when a sync error occurs)
function _addListeners(modelCollection) {
	this.listenTo(modelCollection, 'request', _setValues.bind(this, 0.0, true, null));
	this.listenTo(modelCollection, 'sync', _setValues.bind(this, 1.0, false, null));
	this.listenTo(modelCollection, 'error', _setValues.bind(this, 1.0, false, true));
}

function _onProgress(evt) {
	if(evt.lengthComputable) {
		var progress = evt.loaded / evt.total;
		if(this.setValueForKey)
			this.setValueForKey('syncProgress', new ForceValue(progress));
		else
			this.syncProgress = progress;
	}
}

function _startSync(method, model, options) {
	if(!this.__syncListening) {
		this.__syncListening = true;
		_addListeners.call(this, this);
	}
	// Progress event must be added only through the xhr factory since the jqXHR object after ajax() and beforeSend() etc. doesn't have access to the actual XHR
	var __xhr = options.xhr || (Backbone.$.ajaxSettings && Backbone.$.ajaxSettings.xhr) || function() { return new window.XMLHttpRequest(); };
	var onprogress = _onProgress.bind(this);
	options.xhr = function() {
		var xhr = __xhr();
		xhr.addEventListener('progress', onprogress);
		xhr.upload.addEventListener('progress', onprogress);
		return xhr;
	};
}

// Wrap the sync method to detect when a request is taking place, only done in case a sync starts before being given to a View
// Apply listeners only once
var __modelSync = Model.prototype.sync;
Model.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __modelSync.apply(this, arguments);
};
var __collectionSync = Collection.prototype.sync;
Collection.prototype.sync = function() {
	_startSync.apply(this, arguments);
	return __collectionSync.apply(this, arguments);
};

Cord.mixins.syncing = {
	properties: {
		syncing: {
			value: false,
			readonly: true
		},
		syncProgress: {
			value: 0.0,
			readonly: true
		},
		syncError: {
			value: null,
			readonly: true
		}
	},
	_initSyncingProperties: function(modelCollection) {
		if(modelCollection) {
			this.setValueForKey('syncing', new ForceValue(modelCollection.syncing));
			this.setValueForKey('syncProgress', new ForceValue(modelCollection.syncProgress));
			this.setValueForKey('syncError', new ForceValue(modelCollection.syncError));
			_addListeners.call(this, modelCollection);
		}
	},
	setModel: function(model) {
		this._initSyncingProperties(model);
	},
	setCollection: function(collection) {
		this._initSyncingProperties(collection);
	}
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var EmptyModel = Cord.EmptyModel;
var ForceValue = Cord.ForceValue;

var _formats = {
	url: /^(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i,
	ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i,
	email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
	slug: /^[a-z0-9-]+$/i,
	username: /^[a-z0-9_@\-\+\.]{3,150}$/i,
	color: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i
};

Cord.Validation = {
	formats: _formats
};

Cord.scopes.errors = {
	namespace: 'errors',
	observe: function() {},
	unobserve: function() {},
	getValue: function(key) { return this.errors.get(key); },
	setValue: function() {}
};

Cord.validate = function(value, rule) {
	var i, format, formats, type = rule.type.split(' ')[0];
	if(value === null || (value === '' && rule.type === 'string'))
		return rule.required ? 'required' : true;
	if((type === 'string' && typeof(value) !== 'string') ||
		(type === 'date' && !(value instanceof Date)) ||
		(type === 'int' && !(+value === value && (value % 1) === 0)) ||
		(type === 'float' && typeof(value) !== 'number') ||
		(type === 'bool' && typeof(value) !== 'boolean') ||
		(type === 'array' && !Array.isArray(value)) ||
		(type === 'model' && !(value instanceof Model))
	)
			return 'type';
	if(rule.equals !== null && rule.equals !== void(0)) {
		if(Array.isArray(rule.equals)) {
			if(rule.equals.indexOf(value) === -1)
				return 'equals';
		}
		else if(typeof(rule.equals) === 'object') {
			if(rule.equals[value] === void(0))
				return 'equals';
		}
		else if(value !== rule.equals) {
			return 'equals';
		}
	}
	else {
		if(rule.type === 'string') {
			if(rule.min && value.length < rule.min)
				return 'min';
			if(rule.max && value.length > rule.max)
				return 'max';
			if(rule.format) {
				formats = Array.isArray(rule.format) ? rule.format : [rule.format];
				for(i = 0; i < formats.length; ++i) {
					format = formats[i];
					if(typeof(format) === 'string')
						format = _formats[format];
					if((typeof(format) === 'function' && !format(value)) ||
						(format instanceof RegExp && !format.test(value))
					)
						return 'format';
				}
			}
		}
		else {
			if(rule.min && value < rule.min)
				return 'min';
			if(rule.max && value > rule.max)
				return 'max';
		}
	}
	return true;
};

Cord.parseValidationError = function(value, rule, error, title) {
	// Override to provide custom error messages based on error strings
	var len = rule.type === 'string' ? 'The length of ' : '';
	var chars = rule.type === 'string' ? ' characters' : '';
	switch(error) {
		case 'required':
			return title + ' is required';
		case 'min':
			return len + title + ' must be greater than or equal to ' + rule.min + chars;
		case 'max':
			return len + title + ' must be less than or equal to ' + rule.max + chars;
		case 'format':
			if(typeof rule.format === 'string')
				return title + ' is not a valid ' + rule.format;
			break;
		default:
			break;
	}
	return title + ' is not valid';
};

Cord.mixins.validation = {
	errors: EmptyModel,
	properties: {
		allErrors: { readonly: true },
		latestError: { readonly: true },
		isValid: function(allErrors) { return !allErrors || !allErrors.length; }
	},
	events: {
		'submit form': 'validateForm'
	},
	initialize: function() {
		this.errors = new Model();
		this.listenTo(this.errors, 'change', function(model) {
			var key, changed = model.changedAttributes();
			if(!changed)
				return;
			for(key in changed)
				this._invokeObservers('errors', key, changed[key]);
		});
		this._addInvalidListener(this.model);
	},
	setModel: function(newModel) {
		this._addInvalidListener(newModel);
	},
	validateForm: function(e) {
		if(this.model.isValid()) {
			this._onValid(this.model, []);
			return true;
		}
		else {
			if(e) {
				e.preventDefault();
				e.stopPropagation();
			}
			return false;
		}
	},
	_addInvalidListener: function(model) {
		if(model !== EmptyModel)
			this.listenTo(model, 'invalid', this._onInvalid);
	},
	_onInvalid: function(model, validationErrors) {
		var attr, errors, allErrors, latestError, changed;

		for(attr in validationErrors) {
			// Convert all validationErrors to error messages
			if(validationErrors[attr] === 'format' && this.model.instructions && this.model.instructions[attr])
				latestError = this.model.instructions[attr];
			else
				latestError = Cord.parseValidationError(this.model.get(attr), this.model.rules[attr], validationErrors[attr], this.model.titles[attr] || 'This field', attr);
			this.errors.set(attr, latestError);
		}
		changed = this.model.changedAttributes();
		for(attr in changed) {
			// Anything in the changedAttributes but not in the validationErrors should be cleared
			if(!validationErrors[attr])
				this.errors.unset(attr);
		}
		allErrors = [];
		errors = this.errors.attributes;
		for(attr in errors)
			allErrors.push(errors[attr]);
		this.setValueForKey('allErrors', new ForceValue(allErrors));
		this.setValueForKey('latestError', new ForceValue(latestError));

	},
	_onValid: function() {
		// Use code within _onInvalid to clear previous error messages
		this._onInvalid(this.model, {});
	}
};

Cord.mixins.validateOnBlur = {
	initialize: function() {
		this._addBlurListener(this.model);
	},
	setModel: function(newModel) {
		this._addBlurListener(newModel);
	},
	_addBlurListener: function(model) {
		if(model !== EmptyModel) {
			model.listen('change', function() {
				if(this.model.validate(this.model.changedAttributes()))
					this._onValid(this.model, []);
			});
		}
	}
};

Model.prototype.validate = function(attributes) {
	var attr, rule, ret, errors = {};
	if(!this.rules)
		return null;
	for(attr in attributes) {
		rule = this.rules[attr];
		if(rule) {
			if(rule.equals === null && rule.equals === void(0))
				rule.equals = this.choices && this.choices[attr];
			ret = Cord.validate(attributes[attr], rule);
			if(ret !== true)
				errors[attr] = ret;
		}
	}
	// Custom validation can also add to the errors object
	if(this.extendedValidate)
		this.extendedValidate(errors);
	if(Object.keys(errors).length)
		return errors;
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var convertToString = Cord.convertToString;
var encodeValue = Cord.encodeValue;
var decodeValue = Cord.decodeValue;
var randomUID = Cord.randomUID;
var setImmediate = Cord.setImmediate;
var regex = Cord.regex;

var _ATTR_PROPERTIES = {
	innerHTML: true,
	value: true,
	checked: true
};
var _DATA_BINDING_ATTR = 'data-binding';
var _currentBinding = null;

function _createAttrObserver(el, attr) {
	if(_ATTR_PROPERTIES[attr])
		return function(key, formatted) {
			if(attr !== 'innerHTML')
				encodeValue(el, formatted);
			else
				el[attr] = convertToString(formatted);
		};
	else
		return function(key, formatted) {
			el.setAttribute(attr, convertToString(formatted));
		};
}

function _createChildObserver(el) {
	return function(key, value) {
		el.textContent = convertToString(value);
	};
}

function _testBindingFeedback(el) {
	// Prevent two-way data binding from creating an infinite feedback loop through dispatching events
	var bindingUid = el.getAttribute(_DATA_BINDING_ATTR);
	if(bindingUid && bindingUid === _currentBinding) {
		_currentBinding = null;
		return true;
	}
	else {
		_currentBinding = bindingUid;
		return false;
	}
}

function _createValueObserver(el) {
	return function(key, value) {
		if(_testBindingFeedback(el))
			return;
		encodeValue(el, value);
	};
}

function _createValueListener(el, key) {
	return function() {
		if(_testBindingFeedback(el))
			return;
		this.setValueForKey(key, decodeValue(el));
	};
}

Backbone.Cord.plugins.push({
	name: 'binding',
	requirements: ['interpolation'],
	attrs: function(context, attrs) {
		var format, listener, twoWay;
		if(!context.isView)
			return;
		// Observe any formatted attributes
		for(var attr in attrs) {
			format = attrs[attr];
			if(typeof format === 'string' && format.match(regex.variableSearch)) {
				this.observeFormat(format, _createAttrObserver(context.el, attr), true);
				delete attrs[attr];
			}
		}
		// innerHTML where acceptable values are a single observer key or an object with __html attribute
		if(attrs.dangerouslySetInnerHTML) {
			if(typeof attrs.dangerouslySetInnerHTML === 'string')
				this.observe(attrs.dangerouslySetInnerHTML, _createAttrObserver(context.el, 'innerHTML'), true);
			else if(attrs.dangerouslySetInnerHTML.__html)
				context.el.innerHTML = attrs.dangerouslySetInnerHTML.__html;
			delete attrs.dangerouslySetInnerHTML;
		}
		// The attr bind is shorthand for both observe and change
		if(attrs.bind) {
			attrs.observe = attrs.bind;
			attrs.change = attrs.bind;
			delete attrs.bind;
		}
		// Observer binding to set the value
		if(attrs.observe) {
			if(attrs.observe === attrs.change || attrs.observe === attrs.input) {
				twoWay = true;
				attrs[_DATA_BINDING_ATTR] = 'binding-' + randomUID();
			}
			this.observe(attrs.observe, _createValueObserver(context.el), true);
			delete attrs.observe;
		}
		// Reverse binding on change or input events to listen to changes in the value
		if(attrs.change) {
			listener = _createValueListener(context.el, attrs.change).bind(this);
			context.el.addEventListener('change', listener);
			delete attrs.change;
		}
		if(attrs.input) {
			listener = _createValueListener(context.el, attrs.input).bind(this);
			context.el.addEventListener('input', listener);
			delete attrs.input;
		}
		// Invoke the reverse listener with the initial value if an initial change event is not expected from an observer
		if(listener && !twoWay)
			setImmediate(listener);
	},
	children: function(context, children) {
		var i, j, child, strings, matches, spliceArgs, node;
		if(!context.isView)
			return;
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(document.createTextNode(strings[j]));
						node = document.createTextNode('');
						this.observe(regex.variableValue.exec(matches[j])[1], _createChildObserver(node), true);
						spliceArgs.push(node);
					}
					if(strings[j].length)
						spliceArgs.push(document.createTextNode(strings[j]));
					Array.prototype.splice.apply(children, spliceArgs);
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var convertToBool = Cord.convertToBool;
var convertToString = Cord.convertToString;
var addClass = Cord.addClass;
var removeClass = Cord.removeClass;
var regex = Cord.regex;

function _createObserver(el, cls) {
	return function(key, value) {
		// Add or remove the class based on the value
		var enabled = convertToBool(value);
		if(enabled)
			addClass(el, cls);
		else
			removeClass(el, cls);
	};
}

function _createFormatObserver(el) {
	var prev = '';
	return function(key, formatted) {
		removeClass(el, prev);
		prev = convertToString(formatted);
		addClass(el, prev);
	};
}

// Support for interpolated class names, such as div.{red}-top and conditional class names such as div.red(red)
Cord.plugins.push({
	name: 'classes',
	requirements: ['interpolation'],
	classes: function(context, classes) {
		var matchInfo;
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			// Check for conditional classes then dynamic classnames
			matchInfo = classes[i].match(regex.conditionalValue);
			if(matchInfo) {
				var el = context.el;
				var cls = classes[i].substr(0, matchInfo.index);
				var key = matchInfo[1];
				this.observe(key, _createObserver(el, cls), true);
				classes.splice(i, 1);
			}
			else if(classes[i].search(regex.variableSearch) !== -1) {
				this.observeFormat(classes[i], _createFormatObserver(context.el), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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
				definition = properties[key];
				if(typeof definition === 'function' && getFunctionArgs(definition).length) {
					properties[key] = {get: definition, readonly: true};
				}
				else if(Cord.isPlainObj(definition) && definition.get && getFunctionArgs(definition.get).length) {
					definition.readonly = true;
				}
			}
		}
	},
	initialize: function() {
		// Enumerate all of the get properties to determine which has a get method with arguments
		if(this.properties) {
			var key, prop, args, i, observer;
			for(key in this.properties) {
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
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;

// Focus an element for keyboard events
// http://stackoverflow.com/questions/3656467/is-it-possible-to-focus-on-a-div-using-javascript-focus-function
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/tabindex
Cord.View.prototype.focus = function(id) {
	var el = id ? this.getChildById(id) : this.el;
	// Add tabindex for elements that normally don't support focus and remove the webkit outline
	if(!el.getAttribute('tabindex')) {
		el.setAttribute('tabindex', -1);
		el.style.outline = 'none';
	}
	el.focus();
};

function _wrapListener(listener) {
	return function(e) {
		if(listener.apply(this, arguments) === false) {
			e.preventDefault();
			e.stopPropagation();
		}
	};
}

function _events(context, attrs) {
	for(var attr in attrs) {
		if(attr.substr(0, 2) === 'on') {
			var listener = (typeof attrs[attr] === 'string') ? this[attrs[attr]] : attrs[attr];
			if(typeof listener === 'function') {
				if(context.isView)
					listener = listener.bind(this);
				context.el.addEventListener(attr.substr(2).toLowerCase(), _wrapListener(listener));
			}
			delete attrs[attr];
		}
	}
}

Cord.plugins.push({
	name: 'events',
	attrs: _events,
	bindings: _events
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var convertToBool = Cord.convertToBool;

function _createObserver(el) {
	var previousDisplay = null;
	return function(key, value) {
		var hidden = convertToBool(value);
		// On the first call, store the original display value
		if(previousDisplay === null)
			previousDisplay = el.style.display;
		el.style.display = hidden ? 'none' : previousDisplay;
	};
}

function _createInvisibleObserver(el) {
	return function(key, value) {
		el.style.visibility = convertToBool(value) ? 'hidden' : 'visible';
	};
}

function _hidden(context, attrs) {
	if(!context.isView)
		return;
	if(attrs.hidden) {
		this.observe(attrs.hidden, _createObserver(context.el), true);
		delete attrs.hidden;
	}
	if(attrs.invisible) {
		this.observe(attrs.invisible, _createInvisibleObserver(context.el), true);
		delete attrs.invisible;
	}
}

// Hide or show an element by setting display none on a truthy value of a bound variable specified as the hidden attribute
// Not very compatible with other code that sets the display with javascript
// Will cache and restore the display value before changing to hidden
Cord.plugins.push({
	name: 'hidden',
	attrs: _hidden,
	bindings: _hidden
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var _regex = Cord.regex;

function _createFormatObserver(strings, properties, formatObserver) {
	return function(key) {
		var i, property, formatted = [];
		for(i = 0; i < properties.length; ++i) {
			formatted.push(strings[i]);
			property = properties[i];
			formatted.push(this.getValueForKey(property));
		}
		formatted.push(strings[i]);
		formatObserver.call(this, key, formatted.join(''));
	};
}

Cord.View.prototype.observeFormat = function(format, observer, immediate) {
	var strings = format.split(_regex.variableSearch);
	var matches = format.match(_regex.variableSearch);
	if(!matches)
		return;
	else if(matches.length === 1 && matches[0] === format) {
		this.observe(_regex.variableValue.exec(matches[0])[1], observer, immediate);
	}
	else {
		var observed = {};
		var i;
		for(i = 0; i < matches.length; ++i)
			matches[i] = _regex.variableValue.exec(matches[i])[1];
		for(i = 0; i < matches.length; ++i) {
			if(!observed[matches[i]]) {
				this.observe(matches[i], _createFormatObserver(strings, matches, observer), immediate);
				// Do not observe more than once per property and only do an immediate callback once
				observed[matches[i]] = true;
				immediate = false;
			}
		}
	}
};

// Plugin doesn't actually do anything but register it anyways
Cord.plugins.push({ name: 'interpolation' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var config = Backbone.Cord.config;

function _updateNode(parent, node, vnode) {
	var i, attr, children, removal;
	if(!node) {
		parent.appendChild(vnode);
		return vnode;
	}
	else if(!vnode) {
		parent.removeChild(node);
		return null;
	}
	else if(node.nodeType !== vnode.nodeType || node.nodeName !== vnode.nodeName) {
		parent.replaceChild(vnode, node);
		return vnode;
	}
	else if(node.nodeType === Node.TEXT_NODE && node.textContent !== vnode.textContent) {
		node.textContent = vnode.textContent;
		return node;
	}
	if(node.attributes) {
		for(i = 0; i < node.attributes.length; ++i) {
			attr = node.attributes[i];
			if(!vnode.hasAttribute(attr.name))
				node.removeAttributeNode(attr);
		}
		// Go backwards because attributes is a live NamedNodeMap
		for(i = vnode.attributes.length - 1; i >= 0; --i)
			node.setAttributeNode(vnode.removeAttributeNode(vnode.attributes[i]));
	}
	// Copy childNodes because it is a live NodeList and iteration needs to be forward
	children = Array.prototype.slice.call(vnode.childNodes);
	for(i = 0; i < children.length; ++i) {
		_updateNode(node, node.childNodes[i], children[i]);
	}
	removal = node.childNodes.length - children.length;
	if(removal > 0) {
		for(i = 0; i < removal; ++i)
			node.removeChild(node.lastChild);
	}
	return node;
}

function _updateChildren(parent, vchildren) {
	var i, change, fragment, children = parent.childNodes;
	vchildren = vchildren || [];
	change = Math.min(children.length, vchildren.length);
	for(i = 0; i < change; ++i)
		_updateNode(parent, children[i], vchildren[i]);
	// Add or remove the difference of not changed
	if(vchildren.length > change) {
		fragment = document.createDocumentFragment();
		for(i = change; i < vchildren.length; ++i)
			fragment.appendChild(vchildren[i]);
		parent.appendChild(fragment);
	}
	else if(children.length > change) {
		change = children.length - change;
		for(i = 0; i < change; ++i)
			parent.removeChild(parent.lastChild);
	}
	return parent;
}

function _once(func) {
	// Call the inner function only once by tracking a single tid
	var tid;
	return function() {
		if(!tid)
			tid = Cord.setImmediate(function() { func(); });
	};
}

// Virtual-dom compare and update methods
Cord.DOM = {
	updateNode: _updateNode,
	updateChildren: _updateChildren
};

Cord.Component = Cord.View.extend({
	constructor: function() {
		var __render = this.render;
		var first = true;
		this.render = function() {
			this.props = arguments[0];
			if(first && this.componentWillMount)
				this.componentWillMount();
			else if(this.componentWillUpdate)
				this.componentWillUpdate();
			var ret = __render.apply(this, arguments);
			if(first && this.componentDidMount)
				this.componentDidMount();
			else if(this.componentDidUpdate)
				this.componentDidUpdate();
			first = false;
			return ret;
		};
	},
	remove: function() {
		if(this.componentWillUnmount)
			this.componentWillUnmount();
		if(this.componentDidUnmount)
		Cord.setImmediate(this.componentDidUnmount.bind(this));
	},
	setState: function(updates) {
		if(typeof updates === 'function')
			updates = updates.call(this);
		this.setValuesForKeys(updates);
		this.render();
	}
});

// Plugin to detect and wrap a render function if defined on a Cord View
// The render function, like the el function will have the createElement method always provided as the first argument
// The different is though that additional arguments can be given to the render function and they will be reused when automatic rerenders happen
// The render method must return a single element or an array of elements
// Subviews are not allowed inside render
// The returned value from render will then be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// Dynamically created event handlers and reverse binding will not work inside rendered elements because they are not transferable on the virtual-dom update
// Do not use expressions inside render, simply write out the code needed
Cord.plugins.push({
	name: 'render',
	config: {
		renderContainerId: 'container'
	},
	requirements: ['events'],
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = config.prefixCreateElement ? this.render.bind(this, this._createElement) : this.render;
			var __observe = this.observe;
			var _renderedObserver;
			var _renderedObservers = {};
			var _renderedArgs;
			this.render = function() {
				var key, rendered, container = this.getChildById(Cord.config.renderContainerId) || this.el;
				var firstRender = !container.children.length;
				var prevContext;

				// Cleanup all rendered observers
				for(key in _renderedObservers)
					this.unobserve(key, _renderedObservers[key]);
				_renderedObservers = {};

				// Check to see if arguments have been updated and save them to be used when calling the __render method
				// The initial setImmediate and observer method both use setImmediate with no arguments, so the arguments should be empty through those calls
				if(arguments.length)
					_renderedArgs = Array.prototype.slice.call(arguments);

				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				_renderedObserver = _once(this.render.bind(this));
				this.observe = function(key, observer) {
					if(firstRender)
						__observe.call(this, '%' + key, observer);
					else
						observer.call(this, key, this.getValueForKey(key));
					if(!_renderedObservers[key])
						__observe.call(this, key, _renderedObservers[key] = _renderedObserver);
				};
				this.createSubview = function() { console.error('Subviews not allowed inside render()'); };

				// Render with createSubview function blocked and observer function wrapped
				prevContext = Cord._viewContext;
				Cord._viewContext = this;
				try {
					rendered = __render.apply(this, _renderedArgs) || [];
					if(!(rendered instanceof Array))
						rendered = [rendered];
				}
				finally {
					delete this.observe;
					delete this.createSubview;
					Cord._viewContext = prevContext;
				}

				// Update the DOM
				_updateChildren(container, rendered);
				this.trigger('render', this);
				return this;
			};
		}
	},
	attrs: function(context, attrs) {
		// Compatibility for a ref callback function, but really id should be used instead
		if(attrs.ref) {
			Cord.setImmediate(attrs.ref.bind(this, context.el));
			delete attrs.ref;
		}
	},
	bindings: function(context, bindings) {
		// Shortcut to render a subview after placement in a layout
		if(bindings.render) {
			// Save the render args for later upon complete
			context.renderArgs = bindings.render;
			delete bindings.render;
		}
	},
	complete: function(context) {
		// Automatically render if a render function is provided
		if(context.subview && context.subview.render !== Backbone.View.prototype.render) {
			context.subview.render(context.renderArgs);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var View = Cord.View;
var config = Cord.config;
var regex = Cord.regex;
var mixObj = Cord.mixObj;
var copyObj = Cord.copyObj;
var isPlainObj = Cord.isPlainObj;
var convertToString = Cord.convertToString;
var log = Cord.log;

var _THIS_ID = '(this)';
var _ua = navigator.userAgent.toLowerCase();
var _browser = (/(chrome|safari)/.exec(_ua) || /firefox/.exec(_ua) || /msie/.exec(_ua) || /trident/.exec(_ua) || /opera/.exec(_ua) || '')[0];
var _stylePrefix = ({ chrome: 'webkit', firefox: 'Moz', msie: 'ms', opera: 'O', safari: 'webkit', trident: 'ms' })[_browser] || '';
var _eventPrefix = ({ chrome: 'webkit', opera: 'webkit', safari: 'webkit' })[_browser] || '';
var _cssPrefix = '-' + _stylePrefix.toLowerCase() + '-';
var _styleSheets = {};
var _animations = {};
var _mediaQueries = {
	all: '',
	animations: '',
	hd: 'only screen and (max-width: 1200px)',
	desktop: 'only screen and (max-width: 992px)',
	tablet: 'only screen and (max-width: 768px)',
	phablet: 'only screen and (max-width: 480px)',
	mobile: 'only screen and (max-width: 320px)'
};

function _createStyleSheets() {
	var el, key;
	for(key in _mediaQueries) {
		// Note: cannot use id on stlye tags, but could add a data attribute for identifying
		// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style
		// https://davidwalsh.name/add-rules-stylesheets
		el = document.createElement('style');
		el.type = 'text/css';
		if(_mediaQueries[key])
			el.media = _mediaQueries[key];
		// Webkit hack
		el.appendChild(document.createTextNode(''));
		document.head.appendChild(el);
		_styleSheets[key] = el.sheet;
	}
}

function _getStylePrefix(style, css) {
	if(document.documentElement.style[style] === void(0))
		return css ? _cssPrefix : _stylePrefix;
	return '';
}

function _addStylePrefix(style) {
	var prefix = _getStylePrefix(style);
	if(prefix)
		return prefix + style[0].toUpperCase() + style.substr(1);
	return style;
}

// Really only needed for transition and animation events
// Only webkit prefix is considered given focus on modern browsers see docs for transition and animation events
// http://www.w3schools.com/jsref/dom_obj_event.asp
function _addEventPrefix(name) {
	var standard = name.toLowerCase();
	if(!_eventPrefix || Element.prototype.hasOwnProperty('on' + standard))
		return standard;
	else
		return _eventPrefix + name;
}

function _camelCaseToDash(str) {
	var i, c, start = 0;
	var words = [];
	for(i = 0; i < str.length; ++i) {
		c = str.charCodeAt(i);
		if(c >= 65 && c <= 90 && i) {
			words.push(str.substring(start, i).toLowerCase());
			start = i;
		}
	}
	words.push(str.substring(start, i).toLowerCase());
	return words.join('-');
}

function _addRules(vuid, rules, _styles, selector, media, id) {
	var key, sheet, query, mediaQuery, idQuery, separator;
	media = media || 'all';
	sheet = _styleSheets[media];
	for(key in rules) {
		if(typeof rules[key] === 'object') {
			mediaQuery = idQuery = null;
			separator = '>';
			query = key;
			if(query.indexOf(config.mediaQueryPrefix) === 0) {
				mediaQuery = query.substr(config.mediaQueryPrefix.length);
				if(!_mediaQueries[mediaQuery])
					return;
			}
			if(!mediaQuery) {
				if(query.indexOf(',') !== -1) {
					var queries = query.split(',');
					var expandedRules = {};
					for(var i = 0; i < queries.length; ++i)
						expandedRules[queries[i].trim()] = rules[key];
					_addRules(vuid, expandedRules, _styles, selector, media, id);
					continue;
				}
				if(':+~>'.indexOf(query[0]) !== -1) {
					separator = query[0];
					query = query.substr(1);
				}
				else if(query.indexOf(config.allSelectorPrefix) === 0) {
					separator = ' ';
					query = query.substr(config.allSelectorPrefix.length);
				}
				else if(query.indexOf(config.parentSelectorPrefix) === 0) {
					separator = '';
					query = query.substr(config.parentSelectorPrefix.length);
				}
				if(query[0] === '#')
					idQuery = query.substr(1);
				if(idQuery && !regex.testIdProperty(idQuery, true))
					idQuery = null;
			}
			if(mediaQuery)
				_addRules(vuid, rules[key], _styles, selector, mediaQuery);
			else if(idQuery)
				_addRules(vuid, rules[key], _styles, selector + separator + regex.replaceIdSelectors('#' + idQuery, vuid), media, idQuery);
			else
				_addRules(vuid, rules[key], _styles, selector + separator + regex.replaceIdSelectors(query, vuid), media);
		}
		else {
			var value = rules[key].toString();
			if(value.search(regex.variableSearch) !== -1) {
				var scope = id || _THIS_ID;
				if(!_styles[scope])
					_styles[scope] = {};
				_styles[scope][key] = value;
			}
			else {
				var rule = selector + '{' + _getStylePrefix(key, true) + _camelCaseToDash(key) + ':' + value + ';}';
				log('@' + media,  rule);
				sheet.insertRule(rule, sheet.cssRules.length);
			}
		}
	}
}

var _atKeyframes = '@' + _getStylePrefix('animationName', true) + 'keyframes ';

function _addAnimations(vuid, animations) {
	var sheet = _styleSheets.animations;
	var key, animation, keyframe, temp, step, i, rule, style, keystyles;
	for(key in animations) {
		animation = animations[key];
		if(Array.isArray(animation)) {
			if(animation.length === 1)
				animation.unshift({});
			temp = animation;
			animation = {};
			step = (100/(temp.length - 1));
			for(i = 0; i < temp.length; ++i)
				animation[Math.ceil(step * i) + '%'] = temp[i];
			animations[key] = animation;
		}
		if(isPlainObj(animation)) {
			// Skip already processed animations, from mixins etc
			if(animation.name)
				continue;
			rule = '';
			for(keyframe in animation) {
				if(keyframe !== 'options' && keyframe !== 'aliases') {
					rule += keyframe + '{';
					keystyles = animation[keyframe];
					for(style in keystyles)
						rule += _getStylePrefix(style, true) + _camelCaseToDash(style) + ':' + keystyles[style] + ';';
					rule += '}';
				}
			}
			if(vuid)
				animation.name = key + '-' + vuid;
			else
				animation.name = key;
			rule = _atKeyframes + animation.name + '{' + rule + '}';
			log(rule);
			sheet.insertRule(rule, sheet.cssRules.length);
		}
	}
}

function _createStyleObserver(node, style) {
	style = _addStylePrefix(style);
	return function(key, formatted) {
		node.style[style] = convertToString(formatted);
	};
}

function _styles(context, attrs) {
	var styles = attrs.style;
	if(styles) {
		if(typeof styles === 'string' && context.isView && this[styles]) {
			styles = this[styles];
		}
		if(typeof styles === 'object') {
			for(var style in styles) {
				if(styles[style].match(regex.variableSearch) && context.isView)
					this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
				else
					context.el.style[_addStylePrefix(style)] = styles[style];
			}
			delete attrs.style;
		}
	}
}

var _DEFAULT_ANIMATION_OPTIONS = {
	duration: '250ms',
	delay: '0',
	timing: 'ease',
	count: '1',
	direction: 'normal',
	fill: 'none',
	state: 'running',
	interactive: true
};

var _animationName = _addStylePrefix('animationName');
var _animationDelay = _addStylePrefix('animationDelay');
var _animationDirection = _addStylePrefix('animationDirection');
var _animationDuration = _addStylePrefix('animationDuration');
var _animationIterationCount = _addStylePrefix('animationIterationCount');
var _animationTimingFunction = _addStylePrefix('animationTimingFunction');
var _animationFillMode = _addStylePrefix('animationFillMode');
var _animationPlayState = _addStylePrefix('animationPlayState');
var _transitionDelay = _addStylePrefix('transitionDelay');
var _transitionDuration = _addStylePrefix('transitionDuration');
var _transitionProperty = _addStylePrefix('transitionProperty');
var _transitionTimingFunction = _addStylePrefix('transitionTimingFunction');

var _animationiteration = _addEventPrefix('AnimationIteration');
var _animationend = _addEventPrefix('AnimationEnd');
var _transitionend = _addEventPrefix('TransitionEnd');

function _parseAnimationSelector(animationSelector, options) {
	var i, key, animation, components = animationSelector.split(/: */);
	var animations, elements;
	if(components.length > 1) {
		animations = components[1].split(/, */);
		elements = this.el.querySelectorAll(regex.replaceIdSelectors(components[0].trim(), this.vuid));
	}
	else {
		animations = components[0].split(/, */);
		elements = [this.el];
	}
	for(i = 0; i < animations.length; ++i) {
		key = animations[i];
		animation = this.animations[key] || _animations[key] || {name: key};
		animations[i] = animation.name;
		if(animation.options)
			options = mixObj(animation.options, options);
	}
	return {animations: animations, elements: elements, options: options};
}

function _getStyleListIndices(list, names) {
	var listValues = list.split(/, */);
	var indices = [];
	for(var i = 0; i < listValues.length; ++i) {
		if(names.indexOf(listValues[i]) !== -1)
			indices.push(i);
	}
	return (indices.length === listValues.length) ? true : indices;
}

function _filterStyleList(list, indices) {
	// remove all specified indices from list
	// true indicates all values are to be filtered out
	if(indices === true)
		return '';
	return list.split(/, */).filter(function(el, i) {
		return (indices.indexOf(i) === -1);
	}).join(',');
}

function _alterStyleList(list, indices, value) {
	var i, listValues = list.split(/, */);
	if(indices === true) {
		for(i = 0; i < listValues.length; ++i)
			listValues[i] = value;
	}
	else {
		for(i = 0; i < indices.length; ++i)
			listValues[indices[i]] = value;
	}
	return listValues.join(',');
}

// animationSelector is a selector: animation names string or array of strings e.g. 'p: one, two'
// TODO: make a better scoped selector syntax like the styles dictionary has
View.prototype.beginAnimation = function(animationSelector, options, callback) {
	var parsed, animations, separator, pointerEvents, elements, el, i, j;
	var iteration, iterationListener, cancelable, endListener;
	if(!options || typeof options === 'function') {
		callback = options;
		options = {};
	}
	if(Array.isArray(animationSelector)) {
		for(i = 1; i < animationSelector; ++i)
			this.beginAnimation(animationSelector[i], options);
		animationSelector = animationSelector[0];
	}
	parsed = _parseAnimationSelector.call(this, animationSelector, options);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	options = mixObj(_DEFAULT_ANIMATION_OPTIONS, parsed.options);
	pointerEvents = options.interactive ? '' : 'none';
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style[_animationName] ? ',' : '';
		for(j = 0; j < animations.length; ++j) {
			el.style[_animationDelay] += separator + options.delay;
			el.style[_animationDirection] += separator + options.direction;
			el.style[_animationDuration] += separator + options.duration;
			el.style[_animationIterationCount] += separator + options.count;
			el.style[_animationTimingFunction] += separator + options.timing;
			el.style[_animationFillMode] += separator + options.fill;
			el.style[_animationPlayState] += separator + options.state;
			el.style[_animationName] += separator + animations[j];
			el.style.pointerEvents = pointerEvents;
			separator = ',';
		}
	}
	// Add an iteration and end listener
	if(parseInt(options.count) > 1 && callback) {
		iteration = 0;
		iterationListener = function(e) {
			if(e.target !== e.currentTarget)
				return;
			iteration += 1;
			if(callback.call(this, iteration, animationSelector, options) === false)
				this.pauseAnimation(animationSelector);
		}.bind(this);
		elements[0].addEventListener(_animationiteration, iterationListener);
	}
	// If options.count is not infinite and fill is none call cancelAnimation at the end
	cancelable = (options.count !== 'infinite' && options.fill === 'none');
	endListener = function(e) {
		if(e.target !== e.currentTarget)
			return;
		if(iterationListener)
			e.target.removeEventListener(_animationiteration, iterationListener);
		e.target.removeEventListener(_animationend, endListener);
		if(cancelable)
			this.cancelAnimation(animationSelector);
		if(callback)
			callback.call(this, -1, animationSelector, options);
	}.bind(this);
	elements[0].addEventListener(_animationend, endListener);
	return this;
};

// Use with caution, updating running animations can be strange
View.prototype._updateAnimation = function(animationSelector, property, value) {
	var parsed, animations, elements, el, i, prevAnimations, indices;
	parsed = _parseAnimationSelector.call(this, animationSelector);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		if(el.style[_animationName] !== prevAnimations) {
			prevAnimations = el.style[_animationName];
			indices = _getStyleListIndices(el.style[_animationName], animations);
		}
		el.style[property] = _alterStyleList(el.style[property], indices, value);
	}
	return this;
};

View.prototype.pauseAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'paused');
};

View.prototype.resumeAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'running');
};

View.prototype.cancelAnimation = function(animationSelector) {
	var parsed, animations, elements, el, i, prevAnimations, indices;
	parsed = _parseAnimationSelector.call(this, animationSelector);
	animations = parsed.animations;
	elements = parsed.elements;
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		if(el.style[_animationName] !== prevAnimations) {
			prevAnimations = el.style[_animationName];
			indices = _getStyleListIndices(el.style[_animationName], animations);
		}
		el.style[_animationDelay] = _filterStyleList(el.style[_animationDelay], indices);
		el.style[_animationDirection] = _filterStyleList(el.style[_animationDirection], indices);
		el.style[_animationDuration] = _filterStyleList(el.style[_animationDuration], indices);
		el.style[_animationIterationCount] = _filterStyleList(el.style[_animationIterationCount], indices);
		el.style[_animationTimingFunction] = _filterStyleList(el.style[_animationTimingFunction], indices);
		el.style[_animationFillMode] = _filterStyleList(el.style[_animationFillMode], indices);
		el.style[_animationPlayState] = _filterStyleList(el.style[_animationPlayState], indices);
		el.style[_animationName] = _filterStyleList(el.style[_animationName], indices);
		el.style.pointerEvents = '';
	}
	return this;
};

// Same arguments as beginAnimation but only used for permanent transitions of styles and apply to a single selector only
View.prototype.beginTransition = function(selector, styles, options, callback) {
	var elements, i, el, separator, style, listener;
	if(isPlainObj(selector)) {
		callback = options;
		options = styles;
		styles = selector;
		selector = null;
	}
	if(typeof options === 'function') {
		callback = options;
		options = {};
	}
	options = mixObj(_DEFAULT_ANIMATION_OPTIONS, options);
	if(selector)
		elements = this.el.querySelectorAll(regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style[_transitionProperty] ? ',' : '';
		for(style in styles) {
			el.style[_transitionDelay] += separator + options.delay;
			el.style[_transitionDuration] += separator + options.duration;
			el.style[_transitionProperty] += separator + _getStylePrefix(style, true) + _camelCaseToDash(style);
			el.style[_transitionTimingFunction] += separator + options.timing;
			el.style[_addStylePrefix(style)] = styles[style];
			separator = ',';
		}
	}
	listener = function(e) {
		var i, el, properties, prevTransitions, indices;
		if(e.target !== e.currentTarget)
			return;
		e.target.removeEventListener(_transitionend, listener);
		properties = Object.keys(styles).map(function(property) {
			return _getStylePrefix(property, true) + _camelCaseToDash(property);
		});
		// Remove the transition properties
		for(i = 0; i < elements.length; ++i) {
			el = elements[i];
			if(el.style[_transitionProperty] !== prevTransitions) {
				prevTransitions = el.style[_transitionProperty];
				indices = _getStyleListIndices(el.style[_transitionProperty], properties);
			}
			el.style[_transitionDelay] = _filterStyleList(el.style[_transitionDelay], indices);
			el.style[_transitionDuration] = _filterStyleList(el.style[_transitionDuration], indices);
			el.style[_transitionProperty] = _filterStyleList(el.style[_transitionProperty], indices);
			el.style[_transitionTimingFunction] = _filterStyleList(el.style[_transitionTimingFunction], indices);
		}
		if(callback)
			callback.call(this, selector, styles, options);
	}.bind(this);
	elements[0].addEventListener(_transitionend, listener);
	return this;
};

View.prototype.applyStyles = function(selector, styles) {
	var elements, i, el, style;
	if(isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	if(selector)
		elements = this.el.querySelectorAll(regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		for(style in styles)
			el.style[_addStylePrefix(style)] = styles[style];
	}
	return this;
};

View.prototype.clearStyles = function(selector, styles) {
	if(isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	styles = copyObj(styles);
	for(var style in styles)
		styles[style] = '';
	this.applyStyles(selector, styles);
	return this;
};

var _DEFAULT_KEYFRAME_ALIASES = {'0%': 'from', 'from': '0%', '100%': 'to', 'to': '100%'};

// Get styles for a keyframe from an animation with a keyframe key
// Animation properties such as animation-timing-function are excluded
// Every animation has at least 2 keyframes from/to or 0%/100%, if keyframe is excluded 0% is the default
View.prototype.getKeyframe = function(animation, keyframe, clear) {
	var aliases, style, styles;
	animation = this.animations[animation] || _animations[animation];
	keyframe = keyframe || '0%';
	aliases = animation.aliases || {};
	styles = animation[keyframe] || animation[_DEFAULT_KEYFRAME_ALIASES[keyframe] || aliases[keyframe]];
	styles = copyObj(styles);
	for(style in styles) {
		if(style.indexOf('animation') === 0)
			delete styles[style];
	}
	if(clear) {
		for(style in styles)
			styles[style] = '';
	}
	return styles;
};

View.prototype.beginKeyframeTransition = function(selector, animation, keyframe, options, callback) {
	var styles;
	if(this.animations[selector] || _animations[selector]) {
		callback = options;
		options = keyframe;
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	if(typeof keyframe !== 'string') {
		callback = options;
		options = keyframe;
		keyframe = null;
	}
	if(typeof options === 'function') {
		callback = options;
		options = {};
	}
	keyframe = keyframe || '0%';
	styles = this.getKeyframe(animation, keyframe);
	if(!selector) {
		var clearKeyframe = this._appliedKeyframes[animation];
		if(clearKeyframe)
			styles = mixObj(this.getKeyframe(animation, clearKeyframe, true), styles);
		this._appliedKeyframes[animation] = keyframe;
	}
	return this.beginTransition(selector, styles, options, callback);
};

View.prototype.applyKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || _animations[selector]) {
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	keyframe = keyframe || '0%';
	if(!selector)
		this._appliedKeyframes[animation] = keyframe;
	return this.applyStyles(selector, this.getKeyframe(animation, keyframe));
};

View.prototype.clearKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || _animations[selector]) {
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	keyframe = keyframe || '0%';
	if(!selector) {
		keyframe = this._appliedKeyframes[animation];
		delete this._appliedKeyframes[animation];
	}
	return this.clearStyles(selector, this.getKeyframe(animation, keyframe));
};

// Expose useful functions, media queries which can be modified, and some browser info
Cord.Styles = {
	userAgent: _ua,
	browser: _browser,
	addStylePrefix: _addStylePrefix,
	addEventPrefix: _addEventPrefix,
	getCSSPrefix: function(style) { return _getStylePrefix(style, true); },
	camelCaseToDash: _camelCaseToDash,
	animations: _animations,
	mediaQueries: _mediaQueries,
	addAnimation: function(nameAnimations, animation) {
		var animations;
		if(!isPlainObj(nameAnimations)) {
			animations = {};
			animations[nameAnimations] = animation;
		}
		else {
			animations = nameAnimations;
		}
		_addAnimations(null, animations);
		_animations = mixObj(_animations, animations);
	}
};

// Accept a style that is either an object or a key to a style object on this (non-binding!)
// e.g. {style: 'mystyle'}, where this.mystyle is an object
// To create an inline style bound to a property, use the binding plugin
// Otherwise, a normal inline-styles string will fall-through and get applied outside this plugin
// e.g. background-color: green; cursor: help;
// When interpolating variables into styles, use this over an interpolated attribute string value
// because the interpolated string value will overwrite any changes to styles on the node made through javascript e.g. the hidden plugin
// Note: interpolated styles are not supported under media queries and require idProperties to be true
Cord.plugins.push({
	name: 'styles',
	requirements: ['interpolation'],
	config: {
		mediaQueryPrefix: '@',
		parentSelectorPrefix: '&',
		allSelectorPrefix: '$'
	},
	attrs: _styles,
	bindings: _styles,
	extend: function(context) {
		// Look for styles hash
		var classNames, _styles = {};
		if(context.protoProps.styles || context.protoProps.animations) {
			if(!context.protoProps.className)
				context.protoProps.className = 'view-' + context.protoProps.vuid;
			if(!Object.keys(_styleSheets).length)
				_createStyleSheets();
			classNames = Cord.getPrototypeValuesForKey(this, 'className', true);
			classNames.push(context.protoProps.className);
			classNames = classNames.join(' ');
			if(context.protoProps.styles)
				_addRules(context.protoProps.vuid, context.protoProps.styles, _styles, '.' + classNames.split(' ').join('.'));
			if(context.protoProps.animations)
				_addAnimations(context.protoProps.vuid, context.protoProps.animations);
		}
		context.protoProps._styles = _styles;
	},
	initialize: function() {
		if(this._styles && this._styles[_THIS_ID]) {
			var styles = copyObj(this._styles[_THIS_ID]);
			log(styles);
			for(var style in styles)
				this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
		}
		this._appliedKeyframes = {};
	},
	complete: function(context) {
		// Apply any dynamic class styles detected from the initial extend
		if(this._styles && context.id && this._styles[context.id]) {
			var styles = copyObj(this._styles[context.id]);
			log(styles);
			for(var style in styles)
				this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var SVG_NS = 'http://www.w3.org/2000/svg';
var XLINK_NS = 'http://www.w3.org/1999/xlink';

// Non-deprecated and non-conflicting SVG elements: https://developer.mozilla.org/en-US/docs/Web/SVG/Element
var SVG_TAGS = {
	animate: 1,
	animateMotion: 1,
	animateTransform: 1,
	circle: 1,
	clipPath: 1,
	'color-profile': 1,
	defs: 1,
	desc: 1,
	discard: 1,
	ellipse: 1,
	feBlend: 1,
	feColorMatrix: 1,
	feComponentTransfer: 1,
	feComposite: 1,
	feConvolveMatrix: 1,
	feDiffuseLighting: 1,
	feDisplacementMap: 1,
	feDistantLight: 1,
	feDropShadow: 1,
	feFlood: 1,
	feFuncA: 1,
	feFuncB: 1,
	feFuncG: 1,
	feFuncR: 1,
	feGaussianBlur: 1,
	feImage: 1,
	feMerge: 1,
	feMergeNode: 1,
	feMorphology: 1,
	feOffset: 1,
	fePointLight: 1,
	feSpecularLighting: 1,
	feSpotLight: 1,
	feTile: 1,
	feTurbulence: 1,
	filter: 1,
	font: 1,
	foreignObject: 1,
	g: 1,
	glyph: 1,
	hatch: 1,
	hatchpath: 1,
	image: 1,
	line: 1,
	linearGradient: 1,
	marker: 1,
	mask: 1,
	metadata: 1,
	mpath: 1,
	path: 1,
	pattern: 1,
	polygon: 1,
	polyline: 1,
	radialGradient: 1,
	rect: 1,
	set: 1,
	solidcolor: 1,
	stop: 1,
	svg: 1,
	'switch': 1,
	symbol: 1,
	text: 1,
	textPath: 1,
	tspan: 1,
	use: 1,
	view: 1
};

var XLINK_ATTRS = {
	href: 1,
	show: 1,
	title: 1
};

Backbone.Cord.plugins.push({
	name: 'svg',
	tag: function(context, tag) {
		// Most supported svg tags are provided in the SVG_TAGS, tags conflicting with html such as <a> or any other tag can be forced to SVG with svg or svg: prefix
		if(SVG_TAGS[tag]) {
			return document.createElementNS(SVG_NS, tag);
		}
		else if(tag.substr(0, 3) === 'svg') {
			tag = tag.substr(3);
			if(tag[0] === ':')
				tag = tag.substr(1);
			else
				tag = tag[0].toLowerCase() + tag.substr(1);
			return document.createElementNS(SVG_NS, tag);
		}
	},
	attrs: function(context, attrs) {
		var el = context.el;
		if(el.namespaceURI === SVG_NS) {
			// Normal SVG attributes are set by the default setAttribute function, but a few are xlink or xml namespaced
			for(var attr in attrs) {
				if(XLINK_ATTRS[attr]) {
					// xlink:x attributes
					el.setAttributeNS(XLINK_NS, attr, attrs[attr]);
					delete attrs[attr];
				}
				else if(attr === 'lang') {
					// xml:lang only
					el.setAttributeNS(SVG_NS, attr, attrs[attr]);
					delete attrs[attr];
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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
		for(key in changed)
			this._invokeObservers(namespace, key, changed[key]);
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
