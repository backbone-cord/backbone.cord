;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var compatibilityMode = root.cordCompatibilityMode;
var debug = root.cordDebug;

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
		if(obj.hasOwnProperty(key)) {
			value = obj[key];
			if(_isPlainObj(value))
				value = _copyObj(value);
			copy[key] = value;
		}
	}
	return copy;
}

// Internal use only for when there are one or more subkeys to resolve on an object, view, or model
function _getObjValue(obj, keys) {
	var i, key;
	keys = Array.isArray(keys) ? keys : keys.split('.');
	for(i = 0; i < keys.length; ++i) {
		key = keys[i];
		if(obj instanceof Backbone.Cord.View) {
			// If a namespace is included in the keys pass the pair (which is still a single key) to getValueForKey
			if(Backbone.Cord._scopes[key.toLowerCase()] && ((i + 1) < keys.length)) {
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
				obj = Backbone.Cord.decodeValue(obj);
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
	if(obj instanceof Backbone.Cord.View) {
		obj.setValueForKey(key, value);
	}
	else if(obj instanceof Backbone.Model) {
		obj.set((key === 'id' ? obj.idAttribute : key), value);
	}
	else if(obj) {
		if(key === 'value' && obj.nodeType === Node.ELEMENT_NODE)
			Backbone.Cord.encodeValue(obj, value);
		else
			obj[key] = value;
	}
}

// Helper functions for mixing objects and prototypes
function _chain(f1, f2) { return function() { f1.apply(this, arguments); return f2.apply(this, arguments); }; }
function _terminate(f, key) { return function() { var ret = f.apply(this, arguments); var parent = Object.getPrototypeOf(Object.getPrototypeOf(this)); return (parent && parent[key]) ? parent[key].apply(this, arguments) : ret || this; }; }

// Create a copy of obj and mixin the other arguments in order
// Works much like _.extend() but does a recursive merging of plain objects
// Good for creating and using view mixins
// Register mixins with Backbone.Cord.mixins
function _mixObj(obj) {
	var i, key, value, other, otherValue;
	if(typeof obj === 'string')
		obj = Backbone.Cord.mixins[obj] || {};
	obj = _copyObj(obj);
	for(i = 1; i < arguments.length; ++i) {
		other = arguments[i];
		if(typeof other === 'string')
			other = Backbone.Cord.mixins[other] || {};
		for(key in other) {
			if(other.hasOwnProperty(key)) {
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
	}
	return obj;
}

// Same as _mixObj, but will terminate (call parent) any function chains if the last (terminal) obj did not implement the function
function _mixProto() {
	var key, value, obj = _mixObj.apply(this, arguments);
	var terminal = arguments[arguments.length - 1];
	if(typeof terminal === 'string')
		terminal = Backbone.Cord.mixins[terminal] || {};
	for(key in obj) {
		if(obj.hasOwnProperty(key)) {
			value = obj[key];
			if(typeof value === 'function' && typeof terminal[key] !== 'function')
				obj[key] = _terminate(value, key);
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

function _callPlugins(name, context) {
	// For each callbacks, call and return false if false is returned
	// Context object to communicate data between plugins and callbacks
	var callbacks = Backbone.Cord._callbacks[name];
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
	tagIdClasses = tagIdClasses.split('.');
	var context = { isView: this instanceof Backbone.Cord.View };
	var tagId = tagIdClasses[0].split('#');
	var tag = tagId[0] ? tagId[0] : 'div';
	var el = context.el = this._callPlugins('tag', context, tag) || document.createElement(tag);
	var id = context.id = tagId[1];
	if(id)
		Backbone.Cord.setId(el, id, this.vuid);
	var classes = tagIdClasses.slice(1);
	Backbone.Cord.addClass(el, this._callPlugins('classes', context, classes) || classes);
	if(arguments.length > 1) {
		// If attrs is not the start of children, then apply the dictionary as attributes
		var i = 1;
		if(!(typeof attrs === 'string' || attrs instanceof Backbone.View || attrs instanceof Node)) {
			i = 2;
			// Copy attrs to prevent side-effects
			attrs = _copyObj(attrs);
			attrs = this._callPlugins('attrs', context, attrs) || attrs;
			for(var attr in attrs) {
				if(attrs.hasOwnProperty(attr))
					el.setAttribute(attr, attrs[attr]);
			}
		}
		// Copy arguments to prevent side-effects
		var child, children = Array.prototype.slice.call(arguments, i);
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
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getChildById(id); },
			enumerable: true,
			configurable: false
		});
	}
	return this._callPlugins('complete', context) || el;
}

// id and classes on the subview are maintained, but recommended that id is set by the parent view
function _createSubview(instanceClass, idClasses, bindings, keyValues) {
	var id, classes, subview, context, callback;
	if(!(instanceClass instanceof Backbone.View))
		subview = new instanceClass();
	else
		subview = instanceClass;
	// Init the subview's model - blocking the _invokeObservers method to prevent unnecessary observer invocations
	if(this.model !== Backbone.Cord.EmptyModel && subview.model === Backbone.Cord.EmptyModel && !subview.collection && subview instanceof Backbone.Cord.View) {
		subview._invokeObservers = function() {};
		if(!subview.cascade || subview.cascade(this.model) !== false)
			subview.setModel(this.model);
		delete subview._invokeObservers;
	}
	// Create the plugin context - isView should always be true, this method should never be called any other way
	context = { el: subview.el, isView: this instanceof Backbone.Cord.View, subview: subview };
	if(!context.isView)
		throw new Error('Attempting to create a subview without a parent.');
	if(typeof idClasses === 'string') {
		idClasses = idClasses.split('.');
		id = context.id = idClasses[0].substr(1);
		if(id && !Backbone.Cord.hasId(subview.el))
			Backbone.Cord.setId(subview.el, id, this.vuid);
		classes = idClasses.slice(1);
		Backbone.Cord.addClass(subview.el, this._callPlugins('classes', context, classes) || classes);
	}
	else {
		keyValues = bindings;
		bindings = idClasses;
	}
	if(bindings) {
		// Copy bindings to prevent side-effects
		bindings = _copyObj(bindings);
		bindings = this._callPlugins('bindings', context, bindings) || bindings;
		for(var e in bindings) {
			if(bindings.hasOwnProperty(e)) {
				callback = (typeof bindings[e] === 'string') ? (this[bindings[e]] || _createSetValueCallback(bindings[e])) : bindings[e];
				if(typeof callback === 'function') {
					if(subview.properties && subview.properties.hasOwnProperty(e))
						subview.observe(e, callback.bind(this));
					else
						this.listenTo(subview, e, callback);
				}
			}
		}
	}
	if(keyValues)
		subview.setValuesForKeys(keyValues);
	subview.sid = Backbone.Cord._sid;
	Backbone.Cord._sid += 1;
	subview.el.setAttribute('data-sid', subview.sid);
	this.subviews[subview.sid] = subview;
	this.listenToOnce(subview, 'remove', function(subview) {
		this.stopListening(subview);
		delete this.subviews[subview.sid];
	});
	// Simply returns getSubviewById so that the property doesn't have another strong reference to the view that would also need to be cleaned up
	if(Backbone.Cord.config.idProperties && context.isView && id && Backbone.Cord.regex.testIdProperty(id)) {
		Object.defineProperty(this, id, {
			get: function() { return this.getSubviewById(id); },
			set: function(value) {
				var el, current;
				if(!(value instanceof Backbone.View))
					throw new Error('Attempting to assign a non-Backbone.View to a subview.');
				// Add the new subview and remove the old from the DOM
				el = value.el;
				current = this.getSubviewById(id);
				current.el.parentNode.insertBefore(el, current.el);
				current.remove();
				// If the new subview doesn't have an sid it needs to get setup, but without idClasses or bindings
				if(!value.sid)
					this._createSubview(value);
				// Reapply the id or remove the old property if a different id is used
				if(!Backbone.Cord.hasId(el))
					Backbone.Cord.setId(el, id, this.vuid);
				else if(id !== Backbone.Cord.getId(el))
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

Backbone.Cord = {
	VERSION: '1.0.12',
	config: {
		idProperties: true
	},
	// Collection of reusable regular expression objects
	// NOTE: Do not use the regex functions test/exec when the global flag is set because it is stateful (lastIndex). Instead use string methods search/match
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Working_with_regular_expressions
	regex: {
		idPropertyTest: /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
		idSelectorValues: /#([a-zA-Z_$][0-9a-zA-Z_$]*)/g
	},
	// Plugins install themselves by pushing to this array
	plugins: [],
	// Filters installed by the app by setting keys on this object
	filters: {
		lower: function(str) { return str.toLowerCase(); },
		upper: function(str) { return str.toUpperCase(); },
		title: function(str) { return str.replace(/\b[^\s-]*/g, function(s) { return s.charAt(0).toUpperCase() + s.substr(1).toLowerCase(); }); }
	},
	// Value decoders and encoders for when "value" is get or set on an element, keys into decoders/encoders is based on the data-type and type attribute
	decoders: {
		range: function(el) { return parseInt(el.value); },
		number: function(el) { return Number(el.value); },
		integer: function(el) { return parseInt(el.value); },
		decimal: function(el) { return parseFloat(el.value); },
		date: function(el) { return new Date(el.value); },
		datetime: function(el) { return new Date(el.value); },
		checkbox: function(el) { return el.checked; }
	},
	encoders: {
		date: function(el, value) { el.value = value.toDateString(); },
		datetime: function(el, value) { el.value = value.toString(); },
		checkbox: function(el, value) { el.checked = Backbone.Cord.convertToBool(value); }
	},
	decodeValue: function(el) {
		var decoder = Backbone.Cord.decoders[el.getAttribute('data-type') || el.getAttribute('type')];
		return decoder ? decoder(el) : el.value;
	},
	encodeValue: function(el, value) {
		var encoder = Backbone.Cord.encoders[el.getAttribute('data-type') || el.getAttribute('type')];
		if(encoder)
			encoder(el, value);
		else
			el.value = Backbone.Cord.convertToString(value);
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('change', true, true);
		el.dispatchEvent(evt);
	},
	// Mixins installed by the app by setting keys on this object
	mixins: {},
	copyObj: _copyObj,
	mixObj: _mixObj,
	mixProto: _mixProto,
	isPlainObj: _isPlainObj,
	getPrototypeValuesForKey: _getPrototypeValuesForKey,
	convertToString: function(obj) { if(obj === null || obj === void(0)) return ''; return obj.toString(); },
	convertToBool: function(value) { return !!(value && (value.length === void(0) || value.length)); },
	convertToNumber: function(value) { return Number(value) || 0; },
	// Generate a 2-byte time-secured random uid by taking the last 4 characters of a number between 0x10000 and 0x20000
	randomUID: function() { return (Math.floor((1 + Math.random()) * 0x10000) ^ (Date.now() % 0x10000)).toString(16).substr(1); }, // jshint ignore:line
	randomGUID: function() { var c4 = this.randomUID; return c4() + c4() + '-' + c4() + '-' + c4() + '-' + c4() + '-' + c4() + c4() + c4(); },
	randomCode: function(len) { var c = ''; len = len || 12; while(c.length < len) c += this.randomUID(); return c.substr(0, len); },
	// Run a callback immediately after the current call stack
	setImmediate: (root.requestAnimationFrame || root.setTimeout).bind(root),
	clearImmediate: (root.cancelAnimationFrame || root.clearTimeout).bind(root),
	// Internally set readonly properties with the ForceValue object
	ForceValue: function(value) { this.value = value; },
	// Initialize the Cord View class depending on the compatibility mode
	View: compatibilityMode ? Backbone.View.extend({}) : Backbone.View,
	// EmptyModel, EmptyView, and EmptyCollection to use as default model, subview placeholder, and fallback collection on setCollection(null)
	EmptyModel: new (Backbone.Model.extend({set: function() { return this; }, toString: function() { return ''; }}))(),
	EmptyView: Backbone.View.extend({ tagName: 'meta' }),
	EmptyCollection: new (Backbone.Collection.extend({add: function() { return this; }, reset: function() { return this; }, set: function() { return this; }, toString: function() { return ''; }}))(),
	// Layout creation methods
	createElement: _createElement,
	createSubview: _createSubview,
	createText: _createText,
	// Unique internal subview id, this unifies how subviews with and without ids are stored
	_sid: 1,
	_pluginsChecked: false,
	_callPlugins: _callPlugins,
	_scopes: {},
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
		remove: [],
		// plugin callback to be used adhoc for processing strings from other plugins
		strings: []
	}
};
if(typeof exports === 'object')
	module.exports = Backbone.Cord;

Backbone.Cord.log = (debug ? function() {
	var format = [];
	var args = Array.prototype.slice.call(arguments);
	for(var i = 0; i < args.length; ++i)
		format.push((typeof args[i] === 'object') ? '%O' : '%s');
	args.unshift(format.join(' | '));
	console.log.apply(console, args);
} : function(){});

// Override or wrap to provide different keyPath processing, different prefixes, or shorthands
// The return value must be an array of the different key path components, with the first being the namespace normalized to lowercase
Backbone.Cord.parseKeyPath = function(keyPath) {
	var components;
	keyPath = keyPath.replace(/__/g, '.');
	components = keyPath.split('.');
	// Default to the view scope
	if(components.length === 1 || !Backbone.Cord._scopes[components[0].toLowerCase()])
		components.unshift('this');
	else
		components[0] = components[0].toLowerCase();
	return components;
};

Backbone.Cord.hasId = function(el) {
	return !!el.getAttribute('data-id');
};
Backbone.Cord.getId = function(el) {
	return el.getAttribute('data-id').split('-')[0];
};
Backbone.Cord.setId = function(el, id, vuid) {
	el.setAttribute('data-id', id + (vuid ? ('-' + vuid) : ''));
};

// Use get/set attribute because className doesn't work with svg elements
// cls argument for add/remove can be a space separated string or an array of single class strings
Backbone.Cord.hasClass = function(el, cls) {
	return (el.getAttribute('class') || '').split(' ').indexOf(cls) !== -1;
};
Backbone.Cord.addClass = function(el, cls) {
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(var i = 0; i < cls.length; ++i) {
		if(!Backbone.Cord.hasClass(el, cls[i]))
			el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + cls[i]).trim());
	}
};
Backbone.Cord.removeClass = function(el, cls) {
	var i, clss = (el.getAttribute('class') || '').split(' ');
	if(!Array.isArray(cls))
		cls = cls.split(' ');
	for(i = clss.length - 1; i >= 0; --i) {
		if(cls.indexOf(clss[i]) !== -1)
			clss.splice(i, 1);
	}
	el.setAttribute('class', clss.join(' '));
};

Backbone.Cord.regex.replaceIdSelectors = function(query, vuid) {
	return query.replace(this.idSelectorValues, '[data-id="$1' + (vuid ? ('-' + vuid) : '') + '"]');
};
Backbone.Cord.regex.testIdProperty = function(id, noThrow) {
	var result = this.idPropertyTest.test(id);
	if(!result && !noThrow)
		throw new Error('Invalid id "' + id + '" used');
	return result;
};
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
Object.defineProperties(Backbone.Cord.regex, {
	variable: _regexPropertyDescriptor('variable'),
	conditional: _regexPropertyDescriptor('conditional'),
	expression: _regexPropertyDescriptor('expression')
});
// Regex patterns can be configured by setting prefix/suffix values through these properties
Backbone.Cord.regex.variable = {prefix: '{', suffix: '}'};
Backbone.Cord.regex.conditional = {prefix: '(', suffix: ')'};
Backbone.Cord.regex.expression = {prefix: ':=', suffix: '=:'};

Backbone.Cord.plugins._check = function() {
	var i, j, plugin, loaded = {};
	for(i = 0; i < this.length; ++i)
		loaded[this[i].name] = true;
	for(i = 0; i < this.length; ++i) {
		plugin = this[i];
		if(plugin.requirements) {
			for(j = 0; j < plugin.requirements.length; ++j)
				if(!loaded[plugin.requirements[j]])
					throw new Error('Backbone.Cord plugin "' + plugin.name + '" requires missing plugin "' + plugin.requirements[j] + '"');
		}
	}
};
Backbone.Cord.plugins._register = function(plugin, fnc) {
	// Copy all of the default config settings
	if(plugin.config) {
		for(var setting in plugin.config) {
			if(plugin.config.hasOwnProperty(setting) && !Backbone.Cord.config.hasOwnProperty(setting))
				Backbone.Cord.config[setting] = plugin.config[setting];
		}
	}
	// Push references to all of the callback methods
	for(var callback in Backbone.Cord._callbacks) {
		if(Backbone.Cord._callbacks.hasOwnProperty(callback) && typeof plugin[callback] === 'function')
			fnc.call(Backbone.Cord._callbacks[callback], plugin[callback]);
	}
	// Register a variable scope
	if(plugin.scope)
		Backbone.Cord._scopes[plugin.scope.namespace.toLowerCase()] = plugin.scope;
	return fnc.call(this, plugin);
};
Backbone.Cord.plugins.unshift = function(plugin) {
	return this._register(plugin, Array.prototype.unshift);
};
Backbone.Cord.plugins.push = function(plugin) {
	return this._register(plugin, Array.prototype.push);
};

// Expose createElement and createSubview on the View object as well
// _callPlugins is added because this._callPlugins is used for callbacks
// _createElement is added to override Backbone's _createElement when el is not a function
Backbone.Cord.View.prototype.createElement = _createElement;
Backbone.Cord.View.prototype.createSubview = _createSubview;
Backbone.Cord.View.prototype.createText = _createText;
Backbone.Cord.View.prototype._callPlugins = _callPlugins;
Backbone.Cord.View.prototype._createElement = _createElement;

// Built-in view property scope for observing view properties
// Observe to add observer methods for existing view properties first and model attributes second
// Partly based on the watch/unwatch polyfill here: https://gist.github.com/eligrey/384583
// If wrapping properties, be sure to set configurable: true and (recommended) enumerable: true
function _propertyObserver(key, prevSet) {
	var newSet = function(value) {
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
Backbone.Cord._scopes.this = {
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
Backbone.Cord.View.prototype._synthesizeGetter = function(key) {
	key = '_' + key;
	return function() { return this[key]; };
};
Backbone.Cord.View.prototype._synthesizeSetter = function(key) {
	key = '_' + key;
	return function(value) { this[key] = value; };
};
Backbone.Cord.View.prototype._synthesizeReadonlySetter = function(key) {
	key = '_' + key;
	return function(value) {
		if(typeof value === 'object' && Object.getPrototypeOf(value) === Backbone.Cord.ForceValue.prototype)
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
// Readonly properties are publicly readonly but privately writeable by assigning values with the Backbone.Cord.ForceValue object
Backbone.Cord.View.prototype._synthesizeProperty = function(key, definition) {
	var value = null;
	var readonly = false;
	var descriptor = { configurable: true, enumerable: true };
	if(typeof definition === 'function') {
		descriptor.get = definition;
	}
	else if(_isPlainObj(definition)) {
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

// Do not externally modify the array or object returned from this method
// An empty array or object are returned when no observers exist
// key argument is optional
// create is also optional and if true will interally create the observer array or object as needed
Backbone.Cord.View.prototype._getObservers = function(namespace, key, create) {
	var observers;
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
};
Backbone.Cord.View.prototype._hasObservers = function(namespace, key) {
	var observers = this._getObservers(namespace, key);
	if(Array.isArray(observers))
		return !!observers.length;
	return !!Object.keys(observers).length;
};
Backbone.Cord.View.prototype._addObserver = function(namespace, key, observer) {
	var observers = this._getObservers(namespace, key, true);
	observers.push(observer);
};
Backbone.Cord.View.prototype._removeObserver = function(namespace, key, observer) {
	var observers = this._getObservers(namespace);
	if(observers[key]) {
		var index = observers[key].indexOf(observer);
		if(index !== -1) {
			observers[key].splice(index, 1);
			if(!observers[key].length)
				delete observers[key];
		}
	}
};
Backbone.Cord.View.prototype._invokeObservers = function(namespace, key, value) {
	Backbone.Cord.log(namespace, key, value);
	var i, observers = this._getObservers(namespace, key);
	for(i = 0; i < observers.length; ++i)
		observers[i].call(this, key, value);
	return this;
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
		func.call(this, key, !Backbone.Cord.convertToBool(value));
	};
}
function _applySubkeys(func, keys) {
	return function(key, value) {
		return func.call(this, key, _getObjValue(value, keys));
	};
}
Backbone.Cord.View.prototype.observe = function(key, observer, immediate) {
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
			filters.push(Backbone.Cord.filters[names[i].trim()] || Math[names[i].trim()]);
		observer = _applyFilters(observer, filters);
	}
	// If key starts with %, just do an immediate timeout with the getValue
	// Doesn't include the key on callback since this is used only for binding straight to some output
	if(key[0] === '%') {
		key = key.substr(1);
		Backbone.Cord.setImmediate(function() { observer.call(this, null, this.getValueForKey.call(this, key)); }.bind(this));
		return this;
	}
	path = Backbone.Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Backbone.Cord._scopes[namespace];
	// Support any subkeys but only changes to the top-level key are observed
	if(path.length > 2)
		observer = _applySubkeys(observer, path.slice(2));
	// Add the observer
	scope.observe.call(this, key, observer, immediate);
	this._addObserver(namespace, key, observer);
	if(immediate)
		Backbone.Cord.setImmediate(function() { observer.call(this, key, scope.getValue.call(this, key)); }.bind(this));
	return this;
};
Backbone.Cord.View.prototype.unobserve = function(key, observer) {
	var path, namespace, scope;
	if(typeof observer === 'string')
		observer = this[observer];
	if(!observer)
		return this;
	path = Backbone.Cord.parseKeyPath(key);
	namespace = path[0];
	key = path[1];
	scope = Backbone.Cord._scopes[namespace];
	// Remove the observer
	this._removeObserver(namespace, key, observer);
	scope.unobserve.call(this, key, observer);
	return this;
};

// A simple event callback, where the last argument is taken as a value to pass into setValueForKey
function _createSetValueCallback(keyPath) {
	return function() {
		this.setValueForKey(keyPath, arguments[arguments.length - 1]);
	};
}
Backbone.Cord.View.prototype.getValueForKey = function(keyPath) {
	var path, scope, value;
	path = Backbone.Cord.parseKeyPath(keyPath);
	scope = Backbone.Cord._scopes[path[0]];
	value = scope.getValue.call(this, path[1]);
	if(path.length > 2)
		value = _getObjValue(value, path.slice(2));
	return value;
};
Backbone.Cord.View.prototype.setValueForKey = function(keyPath, value) {
	var path, scope;
	path = Backbone.Cord.parseKeyPath(keyPath);
	scope = Backbone.Cord._scopes[path[0]];
	// Use _setObjValue with subkeys, code is optimized with the first getValue, also valid is: _setObjValue(this, path, value);
	if(path.length > 2)
		_setObjValue(scope.getValue.call(this, path[1]), path.slice(2), value);
	else
		scope.setValue.call(this, path[1], value);
	return this;
};
Backbone.Cord.View.prototype.setValuesForKeys = function(values) {
	var i, key;
	if(_isPlainObj(values)) {
		for(key in values) {
			if(values.hasOwnProperty(key))
				this.setValueForKey(key, values[key]);
		}
	} else {
		for(i = 0; (i + 1) < arguments.length; i += 2)
			this.setValueForKey(arguments[i], arguments[i + 1]);
	}
	return this;
};

Backbone.Cord.View.prototype.getChildById = function(id) {
	return this.el.querySelector('[data-id="' + id + '-' + this.vuid + '"]');
};
Backbone.Cord.View.prototype.getSubviewById = function(id) {
	var node = this.getChildById(id);
	if(node)
		return this.subviews[node.getAttribute('data-sid')];
};

// Built-in model scope that simply wraps access to the model, the model listening for observing is managed by setModel()
Backbone.Cord._scopes.model = {
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
// Built-in observer for all changes on the model
Backbone.Cord.View.prototype._modelObserver = function(model, options) {
	var key, changed = options._changed || model.changedAttributes();
	if(!changed)
		return;
	for(key in changed) {
		if(changed.hasOwnProperty(key))
			this._invokeObservers('model', key, changed[key]);
	}
};
// setModel will change the model a View has and invoke any observers
// For best performance and results, models should normally be provided in the View's constructor - only use setModel to swap out an existing model
// A default empty model is provided so that Cord and plugins can always count on a model being available, making the logic a bit easier
// setModel is defined as a method and not a property because it would be too confusing to distinguish between the first set and later changes, this is more explicit
Backbone.Cord.View.prototype.model = Backbone.Cord.EmptyModel;
Backbone.Cord.View.prototype.setModel = function(newModel, noCascade) {
	var key, current, subview, observers;
	if(this.model === newModel)
		return this;
	if(!newModel)
		newModel = Backbone.Cord.EmptyModel;
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
		if(this.model === Backbone.Cord.EmptyModel) {
			for(key in observers) {
				if(observers.hasOwnProperty(key))
					this._invokeObservers('model', key, void(0));
			}
		}
		else {
			this._modelObserver(this.model, {_changed: current.changedAttributes(this.model.attributes)});
		}
	}
	if(!noCascade) {
		for(key in this.subviews) {
			if(this.subviews.hasOwnProperty(key)) {
				subview = this.subviews[key];
				// Do not cascade if the subview is not a Cord View or is intercepted by a cascade method
				if(!(subview instanceof Backbone.Cord.View))
					continue;
				if(subview.cascade && subview.cascade(newModel) === false)
					continue;
				if(subview.model === current && !subview.collection)
					subview.setModel(newModel);
			}
		}
	}
	return this;
};

// setCollection provided as a convention for plugins to wrap
// NOTE: Backbone.Cord.View.prototype.collection is set to EmptyCollection only in the collection mixin
Backbone.Cord.View.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return this;
	if(!newCollection)
		newCollection = Backbone.Cord.EmptyCollection;
	if(!(newCollection instanceof Backbone.Collection))
		throw new Error('Attempting to assign a non-Backbone.Collection to View.collection.');
	this.stopListening(this.collection);
	this.collection = newCollection;
	return this;
};

var __extend = Backbone.Cord.View.extend;
Backbone.Cord.View.extend = function(protoProps, staticProps) {
	protoProps = protoProps || {};
	staticProps = staticProps || {};
	// Create a unique view id for this view class. Can set a static vuid for debugging
	protoProps.vuid = protoProps.vuid || Backbone.Cord.randomUID();
	// Call all of the plugins
	_callPlugins.call(this, 'extend', {protoProps: protoProps, staticProps: staticProps});
	// Replace all of the id selectors in the event delegation
	var key, value, events = protoProps.events;
	if(events) {
		for(key in events) {
			if(events.hasOwnProperty(key) && key.indexOf('#') !== -1) {
				value = events[key];
				delete events[key];
				key = Backbone.Cord.regex.replaceIdSelectors(key, protoProps.vuid);
				events[key] = value;
			}
		}
	}
	// Inherit parent events, properties, and observers - only need to worry about direct inheritance as inheritance builds on itself
	if(this.prototype.events && protoProps.events)
		protoProps.events = _mixObj(this.prototype.events, protoProps.events);
	if(this.prototype.properties && protoProps.properties)
		protoProps.properties = _mixObj(this.prototype.properties, protoProps.properties);
	if(this.prototype.observers && protoProps.observers)
		protoProps.observers = _mixObj(this.prototype.observers, protoProps.observers);
	return __extend.call(this, protoProps, staticProps);
};

// Wrap _ensureElement to add a subviews array
var __ensureElement = Backbone.Cord.View.prototype._ensureElement;
Backbone.Cord.View.prototype._ensureElement = function() {
	if(!Backbone.Cord._pluginsChecked) {
		Backbone.Cord.plugins._check();
		Backbone.Cord._pluginsChecked = true;
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
			if(properties.hasOwnProperty(key))
				this._synthesizeProperty(key, properties[key]);
	}
	// Bind the el method with prefixed args
	var isFun = (typeof this.el === 'function');
	if(isFun)
		this.el = this.el.bind(this, this.createElement.bind(this), this.createSubview.bind(this));
	// Start listening to the model
	if(this.model !== Backbone.Cord.EmptyModel)
		this.listenTo(this.model, 'change', this._modelObserver);
	// Use backbone to actually create the element
	var ret = __ensureElement.apply(this, arguments);
	// Travel the prototype chain and apply all the classNames found, join into a single space separated string because some values might be space separated
	Backbone.Cord.addClass(this.el, _getPrototypeValuesForKey(this, 'className').join(' '));
	this.el.setAttribute('data-vuid', this.vuid);
	// Run plugin initializers
	this._callPlugins('initialize', {});
	// Setup any declared observers
	if(this.observers) {
		var observers = this.observers;
		for(key in observers)
			if(observers.hasOwnProperty(key))
				this.observe(key, observers[key], true);
	}
	return ret;
};

// Wrap the remove method to also process subviews and plugins
var __remove = Backbone.Cord.View.prototype.remove;
Backbone.Cord.View.prototype.remove = function() {
	var key;
	this._callPlugins('remove', {});
	for(key in this.subviews) {
		if(this.subviews.hasOwnProperty(key))
			this.subviews[key].remove();
	}
	this.subviews = null;
	// Some scopes do not need extra cleanup - just setting observers to null and calling stopListening() in __remove()
	// other scopes should implement remove() plugin callback
	this._observers = null;
	this.trigger('remove', this);
	return __remove.apply(this, arguments);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));

;(function(Backbone) {
'use strict';

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
				Backbone.Cord.encodeValue(el, formatted);
			else
				el[attr] = Backbone.Cord.convertToString(formatted);
		};
	else
		return function(key, formatted) {
			el.setAttribute(attr, Backbone.Cord.convertToString(formatted));
		};
}

function _createChildObserver(el) {
	return function(key, value) {
		el.textContent = Backbone.Cord.convertToString(value);
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
		Backbone.Cord.encodeValue(el, value);
	};
}

function _createValueListener(el, key) {
	return function() {
		if(_testBindingFeedback(el))
			return;
		this.setValueForKey(key, Backbone.Cord.decodeValue(el));
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
			if(attrs.hasOwnProperty(attr)) {
				format = attrs[attr];
				if(typeof format === 'string' && format.match(Backbone.Cord.regex.variableSearch)) {
					this.observeFormat(format, _createAttrObserver(context.el, attr), true);
					delete attrs[attr];
				}
			}
		}
		// Support the non-formatted version of innerHTML with just a observer key
		if(attrs.innerHTML) {
			this.observe(attrs.innerHTML, _createAttrObserver(context.el, 'innerHTML'), true);
			delete attrs.innerHTML;
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
				attrs[_DATA_BINDING_ATTR] = 'binding-' + Backbone.Cord.randomUID();
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
			Backbone.Cord.setImmediate(listener);
	},
	children: function(context, children) {
		var i, j, child, strings, matches, spliceArgs, node;
		if(!context.isView)
			return;
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(Backbone.Cord.regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(Backbone.Cord.regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(document.createTextNode(strings[j]));
						node = document.createTextNode('');
						this.observe(Backbone.Cord.regex.variableValue.exec(matches[j])[1], _createChildObserver(node), true);
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

function _createObserver(el, cls) {
	return function(key, value) {
		// Add or remove the class based on the value
		var enabled = Backbone.Cord.convertToBool(value);
		if(enabled)
			Backbone.Cord.addClass(el, cls);
		else
			Backbone.Cord.removeClass(el, cls);
	};
}

function _createFormatObserver(el) {
	var prev = '';
	return function(key, formatted) {
		Backbone.Cord.removeClass(el, prev);
		prev = Backbone.Cord.convertToString(formatted);
		Backbone.Cord.addClass(el, prev);
	};
}

// Support for interpolated class names, such as div.{red}-top and conditional class names such as div.red(red)
Backbone.Cord.plugins.push({
	name: 'classes',
	requirements: ['interpolation'],
	classes: function(context, classes) {
		var matchInfo;
		if(!context.isView)
			return;
		for(var i = classes.length - 1; i >= 0; --i) {
			// Check for conditional classes then dynamic classnames
			matchInfo = classes[i].match(Backbone.Cord.regex.conditionalValue);
			if(matchInfo) {
				var el = context.el;
				var cls = classes[i].substr(0, matchInfo.index);
				var key = matchInfo[1];
				this.observe(key, _createObserver(el, cls), true);
				classes.splice(i, 1);
			}
			else if(classes[i].search(Backbone.Cord.regex.variableSearch) !== -1) {
				this.observeFormat(classes[i], _createFormatObserver(context.el), true);
				classes.splice(i, 1);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

Backbone.Cord.mixins.collection = {
	collection: Backbone.Cord.EmptyCollection,
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
			Backbone.Cord.setImmediate(this._onResetCollection.bind(this));
		}
	},
	getCollectionContainer: function() {
		// Look for a child with the container id, but default to the view's el
		return this.getChildById(Backbone.Cord.config.collectionContainerId) || this.el;
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
				if(this.itemViews.hasOwnProperty(key) && this.itemViews[key].el === indexModelElement) {
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
				if(this.itemViews.hasOwnProperty(cid)) {
					view = this.itemViews[cid];
					this.stopListening(view);
					view.remove();
				}
			}
		}
		this.itemViews = {};
		this.selected = null;
	},
	_onAddItem: function(model, collection, options) {
		var view, container, sibling, index;
		this.length = new Backbone.Cord.ForceValue(collection.length);
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
		this.length = new Backbone.Cord.ForceValue(collection.length);
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
				if(itemRemoval.hasOwnProperty(key) && itemRemoval[key]) {
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
		this.length = new Backbone.Cord.ForceValue(this.collection.length);
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

Backbone.Cord.plugins.push({
	name: 'collection',
	requirements: ['computed'],
	config: {
		collectionContainerId: 'container'
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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

function _detectComputedChanges() {
	var i, key, keys;
	var change, changed = this.changedAttributes();
	var newChanged = {};
	for(change in changed) {
		if(changed.hasOwnProperty(change) && this._computedArgs[change]) {
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
	Backbone.Cord.setImmediate(function() {
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
Backbone.Model.prototype._addComputed = function(key, func) {
	var __get, i, arg, args = _getFunctionArgs(func);
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
var __extend = Backbone.Model.extend;
Backbone.Model.extend = function(properties) {
	var __initialize;
	if(properties.computed) {
		__initialize = properties.initialize || Backbone.Model.prototype.initialize;
		properties.initialize = function() {
			if(this.computed) {
				for(var attr in this.computed) {
					if(this.computed.hasOwnProperty(attr))
						this._addComputed(attr, this.computed[attr]);
				}
			}
			return __initialize.apply(this, arguments);
		};
	}
	return __extend.apply(this, arguments);
};

function _createArgObserver(key, getFunc, args) {
	return function() {
		var i, values = [];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		this[key] = new Backbone.Cord.ForceValue(getFunc.apply(this, values));
	};
}

Backbone.Cord.plugins.push({
	name: 'computed',
	extend: function(context) {
		// Set all computed properties to be readonly
		var properties, key, definition;
		properties = context.protoProps.properties;
		if(properties) {
			for(key in properties) {
				if(properties.hasOwnProperty(key)) {
					definition = properties[key];
					if(typeof definition === 'function' && _getFunctionArgs(definition).length) {
						properties[key] = {get: definition, readonly: true};
					}
					else if(Backbone.Cord.isPlainObj(definition) && definition.get && _getFunctionArgs(definition.get).length) {
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
						args = _getFunctionArgs(prop.get);
						if(args.length) {
							// The observer method then will call this._setKey(argValues...);
							observer = _createArgObserver(key, prop.get, args);
							for(i = 0; i < args.length; ++i)
								this.observe(args[i], observer, i === 0);
							// The get then needs to be replaced with a default getter
							Object.defineProperty(this, key, {get: this._synthesizeGetter(key)});
						}
					}
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

// Focus an element for keyboard events
// http://stackoverflow.com/questions/3656467/is-it-possible-to-focus-on-a-div-using-javascript-focus-function
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/tabindex
Backbone.Cord.View.prototype.focus = function(id) {
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
		if(attr.substr(0, 2) === 'on' && attrs.hasOwnProperty(attr)) {
			var listener = (typeof attrs[attr] === 'string') ? this[attrs[attr]] : attrs[attr];
			if(typeof listener === 'function') {
				if(context.isView)
					listener = listener.bind(this);
				context.el.addEventListener(attr.substr(2), _wrapListener(listener));
			}
			delete attrs[attr];
		}
	}
}

Backbone.Cord.plugins.push({
	name: 'events',
	attrs: _events,
	bindings: _events
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _createObserver(el) {
	var previousDisplay = null;
	return function(key, value) {
		var hidden = Backbone.Cord.convertToBool(value);
		// On the first call, store the original display value
		if(previousDisplay === null)
			previousDisplay = el.style.display;
		el.style.display = hidden ? 'none' : previousDisplay;
	};
}

function _createInvisibleObserver(el) {
	return function(key, value) {
		el.style.visibility = Backbone.Cord.convertToBool(value) ? 'hidden' : 'visible';
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
Backbone.Cord.plugins.push({
	name: 'hidden',
	attrs: _hidden,
	bindings: _hidden
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

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

Backbone.Cord.View.prototype.observeFormat = function(format, observer, immediate) {
	var strings = format.split(Backbone.Cord.regex.variableSearch);
	var matches = format.match(Backbone.Cord.regex.variableSearch);
	if(!matches)
		return;
	else if(matches.length === 1 && matches[0] === format) {
		this.observe(Backbone.Cord.regex.variableValue.exec(matches[0])[1], observer, immediate);
	}
	else {
		var observed = {};
		var i;
		for(i = 0; i < matches.length; ++i)
			matches[i] = Backbone.Cord.regex.variableValue.exec(matches[i])[1];
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
Backbone.Cord.plugins.push({ name: 'interpolation' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _createExpressionProperty(expr, prop) {
	var i, key;
	var strings = expr.split(Backbone.Cord.regex.variableSearch);
	var matches = expr.match(Backbone.Cord.regex.variableSearch);
	// Create the function used to set the expression value
	var code = 'this.' + prop + ' = ';
	for(i = 0; i < matches.length; ++i) {
		code += strings[i];
		key = matches[i] = Backbone.Cord.regex.variableValue.exec(matches[i])[1];
		code += '(Number(this.getValueForKey("' + key + '")) || 0)';
	}
	code += strings[i] + ';';
	/* jshint -W054 */
	var fnc = new Function(code);
	// Manually add observers for all the variables and get one immediate callback with !i
	for(i = 0; i < matches.length; ++i) {
		key = matches[i];
		this.observe(key, fnc, !i);
	}
	// Define the expression property and set enumarable to false
	this._synthesizeProperty(prop);
	Object.defineProperty(this, prop, {enumerable: false});
}

function _replaceExpressions(str) {
	var i, expr, prop, newStr;
	var strings = str.split(Backbone.Cord.regex.expressionSearch);
	var matches = str.match(Backbone.Cord.regex.expressionSearch);
	if(!matches)
		return str;

	for(i = 0; i < matches.length; ++i) {
		expr = Backbone.Cord.regex.expressionValue.exec(matches[i])[1];
		prop = 'expr' + Backbone.Cord.randomUID();
		matches[i] = Backbone.Cord.regex.variable.prefix + prop + Backbone.Cord.regex.variable.suffix;
		_createExpressionProperty.call(this, expr, prop);
	}

	// Rejoin strings and matches
	newStr = '';
	for(i = 0; i < matches.length; ++i) {
		newStr += strings[i];
		newStr += matches[i];
	}
	newStr += strings[i];
	return newStr;
}

// Math needs to run first before other plugins because it changes bindings
Backbone.Cord.plugins.unshift({
	name: 'math',
	attrs: function(context, attrs) {
		if(!context.isView)
			return;
		for(var attr in attrs) {
			if(attrs.hasOwnProperty(attr) && typeof attrs[attr] === 'string' && attrs[attr].search(Backbone.Cord.regex.expressionSearch) !== -1)
				attrs[attr] = _replaceExpressions.call(this, attrs[attr]);
		}
	},
	children: function(context, children) {
		// Similar to binding, look for text children
		if(!context.isView)
			return;
		for(var i = 0; i < children.length; ++i) {
			if(typeof children[i] === 'string' && children[i].search(Backbone.Cord.regex.expressionSearch) !== -1)
				children[i] = _replaceExpressions.call(this, children[i]);
		}
	},
	strings: function(context, strings) {
		for(var str in strings) {
			if(strings.hasOwnProperty(str) && typeof strings[str] === 'string' && strings[str].search(Backbone.Cord.regex.expressionSearch) !== -1)
				strings[str] = _replaceExpressions.call(this, strings[str]);
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

// One-way attribute(s) tracking
Backbone.Model.prototype.track = function(model, attrs, transform) {
	if(typeof attrs === 'function') {
		transform = attrs;
		attrs = null;
	}
	transform = transform || function(data) { return data; };
	if(!attrs) {
		this.listenTo(model, 'change', function(model, options) {
			if(!options._track) {
				options = Backbone.Cord.copyObj(options);
				options._track = true;
				this.set(transform(model.attributes), options);
			}
		});
	}
	else {
		var createListener = function(attr) {
			return function(model, value, options) {
				var data = {};
				data[attr] = value;
				if(!options._track) {
					options = Backbone.Cord.copyObj(options);
					options._track = true;
					this.set(transform(data), options);
				}
			};
		};
		if(typeof attrs === 'string')
			attrs = [attrs];
		for(var i = 0; i < attrs.length; ++i) {
			this.listenTo(model, 'change:' + attrs[i], createListener(attrs[i]));
		}
	}
	return this;
};

// Used for both subobjects and models that are transformed from others
// Submodels could be created on initialize like in the backbone docs
// Transformed modules could be created on the cascade method
Backbone.Model.prototype.subsume = function(cls, attr, transform) {
	var sub = new cls();
	if(typeof attr === 'function') {
		transform = attr;
		attr = null;
	}
	transform = transform || sub.transform || function(data) { return data; };
	// Proxy communication events
	sub.listenTo(this, 'request sync error', function() {
		this.trigger.apply(this, arguments);
	});
	// Perform the initial set and setup tracking
	if(attr) {
		if(Object.keys(this.get(attr)).length)
			sub.set(transform(sub.parse(this.get(attr))));
		sub.track(this, attr, function(data) { return data[attr]; });
		this.track(sub, function(data) { var attrs = {}; attrs[attr] = data; return attrs; });
	}
	else {
		if(Object.keys(this.attributes).length)
			sub.set(transform(sub.parse(this.attributes)));
		sub.track(this, transform);
	}
	return sub;
};

// Two-way tracking
Backbone.Model.prototype.mirror = function(model, attrs) {
	this.track(model, attrs);
	model.track(this, attrs);
	return this;
};

// Plugin doesn't actually do anything but register it anyways
Backbone.Cord.plugins.push({ name: 'modeltracking' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

function _getContainer() {
	// Look for a child with the container id, but default to the view's el
	return this.getChildById(Backbone.Cord.config.renderContainerId) || this.el;
}

function _createSubview() {
	// Just add to a list of subviews for cleanup on next render
	var subview = this.createSubview.apply(this, arguments);
	this._renderedSubviews.push(subview);
	return subview;
}

function _once(func) {
	// Call the inner function only once by tracking a single tid
	var tid;
	return function() {
		if(!tid)
			tid = Backbone.Cord.setImmediate(func);
	};
}

// Plugin to detect and wrap a render function if defined on a Cord View
// The render function, like the el function will have the createElement and createSubview method always given as the first two arguments
// The different is though that additional arguments can be given to the render function and they will be reused when automatic rerenders happen
// The render method must return a single element or subview or an array of mixed elements and subviews
// The returned value from render will then be placed into a documentFragment to be added to the DOM appended to the view's root el or a #container element if specified
// The new wrapped render function gets set on the view instance and can be given the additional arguments directly. e.g. render(arg1, arg2)
// The new wrapped render() method returns this, so that it can be chained
// The enw wrapped render() needs to be explicity called, it does not get called automatically unless some binding has changed within it
// NOTE: do not use reverse binding until more testing is done
Backbone.Cord.plugins.push({
	name: 'render',
	config: {
		renderContainerId: 'container'
	},
	initialize: function() {
		if(this.render !== Backbone.View.prototype.render) {
			var __render = this.render.bind(this, this.createElement.bind(this), _createSubview.bind(this));
			this.render = function() {
				var i, key, rendered, renderedObserver, fragment, container = _getContainer.call(this);
				// Cleanup from last render, elements, subviews, and observers
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(!(rendered instanceof Backbone.View))
						container.removeChild(rendered);
				}
				this._rendered = null;
				for(i = 0; i < this._renderedSubviews.length; ++i)
					this._renderedSubviews[i].remove();
				this._renderedSubviews = [];
				for(key in this._renderedObservers) {
					if(this._renderedObservers.hasOwnProperty(key))
						this.unobserve(key, this._renderedObservers[key]);
				}
				this._renderedObservers = {};
				// Check to see if arguments have been updated and save them to be used when calling the __render method
				// The initial setImmediate and observer method both use setImmediate with no arguments, so the arguments should be empty through those calls
				if(arguments.length)
					this._renderedArgs = Array.prototype.slice.call(arguments);
				// Render and replace the observe method while rendering, so that observers bound to elements etc aren't saved
				// Instead just a single immediate callback and the actual observer is a debounced render
				renderedObserver = _once(this.render.bind(this));
				this.observe = function(key, observer) {
					Backbone.Cord.View.prototype.observe.call(this, '%' + key, observer);
					if(!this._renderedObservers[key])
						Backbone.Cord.View.prototype.observe.call(this, key, this._renderedObservers[key] = renderedObserver);
				};
				this._rendered = __render.apply(this, this._renderedArgs) || [];
				if(!(this._rendered instanceof Array))
					this._rendered = [this._rendered];
				delete this.observe;
				// Add the new rendered nodes to the container
				fragment = document.createDocumentFragment();
				for(i = 0; i < this._rendered.length; ++i) {
					rendered = this._rendered[i];
					if(rendered instanceof Backbone.View)
						fragment.appendChild(rendered.el);
					else
						fragment.appendChild(rendered);
				}
				container.appendChild(fragment);
				this.trigger('render', this);
				return this;
			};
			this._rendered = [];
			this._renderedArgs = [];
			this._renderedSubviews = [];
			this._renderedObservers = {};
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

var _replacementTags = {};

function _getSelectorTag(selector) {
	return selector.split(' ')[0].split('[')[0].split('.')[0].split('#')[0].toLowerCase();
}

// Each replacement function is function(el, parent), where:
// * the el is augmented inside the parent (a document fragment)
// * or a new element is returned, replacing el inside it's parent
// selector MUST include a tag, but otherwise must be any valid query selector
// func is the replacement function taking the args el and fragment and can modify the element by:
// * Modifying the first argument and return nothing
// * Modifying the element and add siblings using the documentFragment provided as the second argument and return nothing
// * Return a completely new element, which may be a subview's el
// NOTES:
// * If replacing an element the old one may still be around with bindings and even as a property through this if an #id is used - be very aware of what the replacement is doing
// * DO NOT replace any root elements in a view's el layout
// * If the element is the root element for a view and the documentfragment is returned, the remove function will not work properly because the view's el becomes an empty documentfragment
function _addReplacement(selector, func) {
	if(typeof selector === 'object') {
		var replacements = selector;
		for(selector in replacements) {
			if(replacements.hasOwnProperty(selector))
				_addReplacement(selector, replacements[selector]);
		}
		return;
	}
	var tag = _getSelectorTag(selector);
	if(!_replacementTags[tag])
		_replacementTags[tag] = [];
	_replacementTags[tag].push({selector: selector, func: func});
}

// Compile replacement functions local to the view only not global
// Works well for a mixin or parent class that needs to control how the subclass creates elements
// The compiled replacements cannot be mixed with other compiled replacements if there is a conflict in selector tags
function _compileReplacements(replacements) {
	var selector, tag, func, compiled = {};
	for(selector in replacements) {
		if(replacements.hasOwnProperty(selector)) {
			tag = _getSelectorTag(selector);
			func = replacements[selector];
			if(!compiled[tag])
				compiled[tag] = [];
			compiled[tag].push({selector: selector, func: func});
		}
	}
	return compiled;
}

Backbone.Cord.Replacements = {
	add: _addReplacement,
	compile: _compileReplacements
};

Backbone.Cord.plugins.push({
	name: 'replacement',
	config: {
		noReplaceAttribute: 'noreplace'
	},
	complete: function(context) {
		var el, i, tag, local, replacements, replacement, fragment, result;
		if(context.subview)
			return;
		el = context.el;
		if(el.hasAttribute(Backbone.Cord.config.noReplaceAttribute)) {
			el.removeAttribute(Backbone.Cord.config.noReplaceAttribute);
			return;
		}
		tag = el.tagName.toLowerCase();
		replacements = _replacementTags[tag];
		local = this.replacements && this.replacements[tag];
		if(local && replacements)
			replacements = local.concat(replacements);
		else
			replacements = replacements || local;
		if(replacements) {
			fragment = document.createDocumentFragment();
			fragment.appendChild(el);
			for(i = 0; i < replacements.length; ++i) {
				replacement = replacements[i];
				if(fragment.querySelector(replacement.selector) === el) {
					// Perform the replacement and persist any given id
					result = replacement.func.call(this, el, fragment) || fragment;
					if(result.nodetype !== Node.DOCUMENT_FRAGMENT_NODE && Backbone.Cord.hasId(el))
						Backbone.Cord.setId(result, Backbone.Cord.getId(el), this.vuid);
					return result;
				}
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

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

;(function(Backbone) {
'use strict';

var _THIS_ID = '(this)';
var _ua = navigator.userAgent.toLowerCase();
var _browser = (/(chrome|safari)/.exec(_ua) || /firefox/.exec(_ua) || /msie/.exec(_ua) || /trident/.exec(_ua) || /opera/.exec(_ua) || '')[0];
var _stylePrefix = ({ chrome: 'webkit', firefox: 'Moz', msie: 'ms', opera: 'O', safari: 'webkit', trident: 'ms' })[_browser] || '';
var _eventPrefix = ({ chrome: 'webkit', opera: 'webkit', safari: 'webkit' })[_browser] || '';
var _cssPrefix = '-' + _stylePrefix.toLowerCase() + '-';

function _createStyleSheets() {
	var el, key;
	var mediaQueries = Backbone.Cord.Styles.mediaQueries;
	Backbone.Cord._styleSheets = {};
	for(key in mediaQueries) {
		if(mediaQueries.hasOwnProperty(key)) {
			// Note: cannot use id on stlye tags, but could add a data attribute for identifying
			// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/style
			// https://davidwalsh.name/add-rules-stylesheets
			el = document.createElement('style');
			el.type = 'text/css';
			if(mediaQueries[key])
				el.media = mediaQueries[key];
			// Webkit hack
			el.appendChild(document.createTextNode(''));
			document.head.appendChild(el);
			Backbone.Cord._styleSheets[key] = el.sheet;
		}
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
	sheet = Backbone.Cord._styleSheets[media];
	for(key in rules) {
		if(rules.hasOwnProperty(key)) {
			if(typeof rules[key] === 'object') {
				mediaQuery = idQuery = null;
				separator = '>';
				query = key;
				if(query.indexOf(Backbone.Cord.config.mediaQueryPrefix) === 0) {
					mediaQuery = query.substr(Backbone.Cord.config.mediaQueryPrefix.length);
					if(!Backbone.Cord.Styles.mediaQueries[mediaQuery])
						return;
				}
				if(!mediaQuery) {
					if(':+~>'.indexOf(query[0]) !== -1) {
						separator = query[0];
						query = query.substr(1);
					}
					else if(query.indexOf(Backbone.Cord.config.allSelectorPrefix) === 0) {
						separator = ' ';
						query = query.substr(Backbone.Cord.config.allSelectorPrefix.length);
					}
					else if(query.indexOf(Backbone.Cord.config.parentSelectorPrefix) === 0) {
						separator = '';
						query = query.substr(Backbone.Cord.config.parentSelectorPrefix.length);
					}
					if(query[0] === '#')
						idQuery = query.substr(1);
					if(idQuery && !Backbone.Cord.regex.testIdProperty(idQuery, true))
						idQuery = null;
				}
				if(mediaQuery)
					_addRules(vuid, rules[key], _styles, selector, mediaQuery);
				else if(idQuery)
					_addRules(vuid, rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors('#' + idQuery, vuid), media, idQuery);
				else
					_addRules(vuid, rules[key], _styles, selector + separator + Backbone.Cord.regex.replaceIdSelectors(query, vuid), media);
			}
			else {
				var value = rules[key].toString();
				if(value.search(Backbone.Cord.regex.variableSearch) !== -1) {
					var scope = id || _THIS_ID;
					if(!_styles[scope])
						_styles[scope] = {};
					_styles[scope][key] = value;
				}
				else {
					var rule = selector + '{' + _getStylePrefix(key, true) + _camelCaseToDash(key) + ':' + value + ';}';
					Backbone.Cord.log('@' + media,  rule);
					sheet.insertRule(rule, sheet.cssRules.length);
				}
			}
		}
	}
}

var _atKeyframes = '@' + _getStylePrefix('animationName', true) + 'keyframes ';

function _addAnimations(vuid, animations) {
	var sheet = Backbone.Cord._styleSheets.animations;
	var key, animation, keyframe, temp, step, i, rule, style, keystyles;
	for(key in animations) {
		if(animations.hasOwnProperty(key)) {
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
			if(Backbone.Cord.isPlainObj(animation)) {
				// Skip already processed animations, from mixins etc
				if(animation.name)
					continue;
				rule = '';
				for(keyframe in animation) {
					if(animation.hasOwnProperty(keyframe) && keyframe !== 'options' && keyframe !== 'aliases') {
						rule += keyframe + '{';
						keystyles = animation[keyframe];
						for(style in keystyles) {
							if(keystyles.hasOwnProperty(style))
								rule += _getStylePrefix(style, true) + _camelCaseToDash(style) + ':' + keystyles[style] + ';';
						}
						rule += '}';
					}
				}
				if(vuid)
					animation.name = key + '-' + vuid;
				else
					animation.name = key;
				rule = _atKeyframes + animation.name + '{' + rule + '}';
				Backbone.Cord.log(rule);
				sheet.insertRule(rule, sheet.cssRules.length);
			}
		}
	}
}

function _createStyleObserver(node, style) {
	style = _addStylePrefix(style);
	return function(key, formatted) {
		node.style[style] = Backbone.Cord.convertToString(formatted);
	};
}

function _styles(context, attrs) {
	var styles = attrs.style;
	if(styles) {
		if(typeof styles === 'string' && context.isView && this[styles]) {
			styles = this[styles];
		}
		if(typeof styles === 'object') {
			// The math plugin doesn't do a deep process of the attributes so invoke string processing here
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style)) {
					if(styles[style].match(Backbone.Cord.regex.variableSearch) && context.isView)
						this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
					else
						context.el.style[_addStylePrefix(style)] = styles[style];
				}
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
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(components[0].trim(), this.vuid));
	}
	else {
		animations = components[0].split(/, */);
		elements = [this.el];
	}
	for(i = 0; i < animations.length; ++i) {
		key = animations[i];
		animation = this.animations[key] || Backbone.Cord.Styles.animations[key] || {name: key};
		animations[i] = animation.name;
		if(animation.options)
			options = Backbone.Cord.mixObj(animation.options, options);
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
Backbone.Cord.View.prototype.beginAnimation = function(animationSelector, options, callback) {
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
	options = Backbone.Cord.mixObj(_DEFAULT_ANIMATION_OPTIONS, parsed.options);
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
Backbone.Cord.View.prototype._updateAnimation = function(animationSelector, property, value) {
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

Backbone.Cord.View.prototype.pauseAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'paused');
};

Backbone.Cord.View.prototype.resumeAnimation = function(animationSelector) {
	return this._updateAnimation(animationSelector, _animationPlayState, 'running');
};

Backbone.Cord.View.prototype.cancelAnimation = function(animationSelector) {
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
Backbone.Cord.View.prototype.beginTransition = function(selector, styles, options, callback) {
	var elements, i, el, separator, style, listener;
	if(Backbone.Cord.isPlainObj(selector)) {
		callback = options;
		options = styles;
		styles = selector;
		selector = null;
	}
	if(typeof options === 'function') {
		callback = options;
		options = {};
	}
	options = Backbone.Cord.mixObj(_DEFAULT_ANIMATION_OPTIONS, options);
	if(selector)
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		separator = !!el.style[_transitionProperty] ? ',' : '';
		for(style in styles) {
			if(styles.hasOwnProperty(style)) {
				el.style[_transitionDelay] += separator + options.delay;
				el.style[_transitionDuration] += separator + options.duration;
				el.style[_transitionProperty] += separator + _getStylePrefix(style, true) + _camelCaseToDash(style);
				el.style[_transitionTimingFunction] += separator + options.timing;
				el.style[_addStylePrefix(style)] = styles[style];
				separator = ',';
			}
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

Backbone.Cord.View.prototype.applyStyles = function(selector, styles) {
	var elements, i, el, style;
	if(Backbone.Cord.isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	if(selector)
		elements = this.el.querySelectorAll(Backbone.Cord.regex.replaceIdSelectors(selector, this.vuid));
	else
		elements = [this.el];
	if(!elements.length)
		return this;
	for(i = 0; i < elements.length; ++i) {
		el = elements[i];
		for(style in styles) {
			if(styles.hasOwnProperty(style)) {
				el.style[_addStylePrefix(style)] = styles[style];
			}
		}
	}
	return this;
};

Backbone.Cord.View.prototype.clearStyles = function(selector, styles) {
	if(Backbone.Cord.isPlainObj(selector)) {
		styles = selector;
		selector = null;
	}
	styles = Backbone.Cord.copyObj(styles);
	for(var style in styles) {
		if(styles.hasOwnProperty(style))
			styles[style] = '';
	}
	this.applyStyles(selector, styles);
	return this;
};

var _DEFAULT_KEYFRAME_ALIASES = {'0%': 'from', 'from': '0%', '100%': 'to', 'to': '100%'};

// Get styles for a keyframe from an animation with a keyframe key
// Animation properties such as animation-timing-function are excluded
// Every animation has at least 2 keyframes from/to or 0%/100%, if keyframe is excluded 0% is the default
Backbone.Cord.View.prototype.getKeyframe = function(animation, keyframe, clear) {
	var aliases, style, styles;
	animation = this.animations[animation] || Backbone.Cord.Styles.animations[animation];
	keyframe = keyframe || '0%';
	aliases = animation.aliases || {};
	styles = animation[keyframe] || animation[_DEFAULT_KEYFRAME_ALIASES[keyframe] || aliases[keyframe]];
	styles = Backbone.Cord.copyObj(styles);
	for(style in styles) {
		if(style.indexOf('animation') === 0 && styles.hasOwnProperty(style))
			delete styles[style];
	}
	if(clear) {
		for(style in styles) {
			if(styles.hasOwnProperty(style))
				styles[style] = '';
		}
	}
	return styles;
};

Backbone.Cord.View.prototype.beginKeyframeTransition = function(selector, animation, keyframe, options, callback) {
	var styles;
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
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
			styles = Backbone.Cord.mixObj(this.getKeyframe(animation, clearKeyframe, true), styles);
		this._appliedKeyframes[animation] = keyframe;
	}
	return this.beginTransition(selector, styles, options, callback);
};

Backbone.Cord.View.prototype.applyKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
		keyframe = animation;
		animation = selector;
		selector = null;
	}
	keyframe = keyframe || '0%';
	if(!selector)
		this._appliedKeyframes[animation] = keyframe;
	return this.applyStyles(selector, this.getKeyframe(animation, keyframe));
};

Backbone.Cord.View.prototype.clearKeyframe = function(selector, animation, keyframe) {
	if(this.animations[selector] || Backbone.Cord.Styles.animations[selector]) {
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
Backbone.Cord.Styles = {
	userAgent: _ua,
	browser: _browser,
	addStylePrefix: _addStylePrefix,
	addEventPrefix: _addEventPrefix,
	getCSSPrefix: function(style) { return _getStylePrefix(style, true); },
	camelCaseToDash: _camelCaseToDash,
	mediaQueries: {
		all: '',
		animations: '',
		hd: 'only screen and (max-width: 1200px)',
		desktop: 'only screen and (max-width: 992px)',
		tablet: 'only screen and (max-width: 768px)',
		phablet: 'only screen and (max-width: 480px)',
		mobile: 'only screen and (max-width: 320px)'
	},
	animations: {},
	addAnimation: function(nameAnimations, animation) {
		var animations;
		if(!Backbone.Cord.isPlainObj(nameAnimations)) {
			animations = {};
			animations[nameAnimations] = animation;
		}
		else {
			animations = nameAnimations;
		}
		_addAnimations(null, animations);
		Backbone.Cord.Styles.animations = Backbone.Cord.mixObj(Backbone.Cord.Styles.animations, animations);
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
Backbone.Cord.plugins.push({
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
			if(!Backbone.Cord._styleSheets)
				_createStyleSheets();
			classNames = Backbone.Cord.getPrototypeValuesForKey(this, 'className', true);
			classNames.push(context.protoProps.className);
			classNames = classNames.join(' ');
			if(context.protoProps.styles)
				_addRules(context.protoProps.vuid, context.protoProps.styles, _styles, '.' + classNames.split(' ').join('.'));
			if(context.protoProps.animations)
				_addAnimations(context.protoProps.vuid, context.protoProps.animations);
		}
		context.protoProps._styles = _styles;
	},
	initialize: function(context) {
		if(this._styles && this._styles[_THIS_ID]) {
			var styles = Backbone.Cord.copyObj(this._styles[_THIS_ID]);
			Backbone.Cord.log(styles);
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(this.el, style), true);
			}
		}
		this._appliedKeyframes = {};
	},
	complete: function(context) {
		// Apply any dynamic class styles detected from the initial extend
		if(this._styles && context.id && this._styles[context.id]) {
			var styles = Backbone.Cord.copyObj(this._styles[context.id]);
			Backbone.Cord.log(styles);
			this._callPlugins('strings', context, styles);
			for(var style in styles) {
				if(styles.hasOwnProperty(style))
					this.observeFormat(styles[style], _createStyleObserver(context.el, style), true);
			}
		}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));

;(function(Backbone) {
'use strict';

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

Backbone.Cord.UnmanagedScopes = {
	set: function(namespace, model) {
		namespace = namespace.toLowerCase();
		if(Backbone.Cord._scopes[namespace])
			throw new Error('Attempting to override an existing scope.');
		Backbone.Cord._scopes[namespace] = _createUnmanagedScope(namespace, model);
	}
};

// Plugin for adding scopes into models not managed by views
// Does not supporting setting an already created namespace
// i.e. don't set a namespace to a new model there currently isn't a way to notify all views observering the scope
Backbone.Cord.plugins.push({ name: 'unmanagedscopes' });

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
