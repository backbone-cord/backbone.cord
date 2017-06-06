;(function(root) {
'use strict';

var Backbone = root.Backbone || require('backbone');
var Cord = Backbone.Cord;
var extendObj = Cord.extendObj;
var isPlainObj = Cord.isPlainObj;
var extendProto = Cord.extendProto;
var ForceValue = Cord.ForceValue;

var convertToString = Cord.convertToString;
var encodeValue = Cord.encodeValue;
var decodeValue = Cord.decodeValue;
var randomGUID = Cord.randomGUID;
var setImmediate = Cord.setImmediate;
var regex = Cord.regex;

var react = root.preact || root.react || require('preact') || require('react');
var Component = react.Component;
var options = react.options;
var __setState = Component.prototype.setState;

var _currentComponent = null;
var _currentBinding = null;
var _DATA_BINDING_ATTR = 'data-binding-guid';
var _DATA_FEEDBACK_ATTR = 'data-binding-feedback';

function _bindGUID(uid, proxy) {
	var guid = null;
	if(uid && _currentComponent) {
		guid = _currentComponent._boundGUIDs[uid] || (_currentComponent._boundGUIDs[uid] = randomGUID());
		_currentComponent._boundGUIDProxies[guid] = proxy;
	}
	return guid;
}

var bind = Cord.bind = function(key, guid) {
	if(!_currentComponent)
		return;
	var boundKey = guid || key;
	if(!_currentComponent._boundKeys[boundKey]) {
		_currentComponent.observe(key, function(key, value) {
			// Don't this.forceUpdate() because it is synchronous, instead call setState with no updates to enqueue a rerender
			if(guid && this._boundGUIDProxies[guid])
				this._boundGUIDProxies[guid].call(this, guid, key, value);
			else
				__setState.call(this, {});
		});
		_currentComponent._boundKeys[boundKey] = true;
	}
	return _currentComponent.getValueForKey(key);
};

var _Key = function(key) {
	this.key = key;
};
var _keyCache = {};
Cord.Key = function(key) { return _keyCache[key] || (_keyCache[key] = new _Key(key)); };

var bindKey = Cord.bindKey = function(valueKey) {
	if(valueKey instanceof _Key)
		return bind(valueKey.key);
	else
		return valueKey;
};

Cord.bindProps = function(props, keys) {
	keys = keys || Object.keys(props);
	for(var i = 0; i < keys.length; ++i)
		props[keys[i]] = bindKey(props[keys[i]]);
	return props;
};

var computed = Cord.computed = function(func, args) {
	args = args || Cord.getFunctionArgs(func);
	if(!args.length)
		return func;
	var compFunc = function(compKey) {
		var i, values = [], state = {};
		compKey = compKey.split('@')[0];
		for(i = 0; i < args.length; ++i)
			values.push(this.getValueForKey(args[i]));
		state[compKey] = func.apply(this, values);
		this.setState(state);
	};
	compFunc._args = args;
	compFunc._computed = true;
	return compFunc;
};

// Add the default scope and have it mirror this.state
Cord.scopes.this = {
	observe: function() {},
	unobserve: function() {},
	getValue: function(key) {
		return this.state[key];
	},
	setValue: function(key, value) {
		var change = {};
		// For compatibility for some older mixins with readonly BB properties
		if(typeof value === 'object' && Object.getPrototypeOf(value) === ForceValue.prototype)
			value = value.value;
		change[key] = value;
		this.setState(change);
	}
};

// Inherit from react's Component so render can be wrapped and mixins applied
Cord.Component = function(props) {
	Component.apply(this, arguments);

	// Init observers
	this._observers = {};

	// Keys is true/false is a bound key is used in the render pipeline
	// GUIDs is mapping of vnode uids to GUIDs
	// Proxies maps GUIDs to a callback function
	this._boundKeys = {};
	this._boundGUIDs = {};
	this._boundGUIDProxies = {};

	// Wrap render, componentDidMount, and componentDidUpdate to allow bind() function to work without a context
	// Wrapping just render is not enough because child vnodes that are functions are not called until after render
	var __render = this.render;
	var __componentDidMount = this.componentDidMount;
	var __componentDidUpdate = this.componentDidUpdate;
	this.render = function() {
		var ret;
		this._prevComponent = _currentComponent;
		_currentComponent = this;
		try {
			ret = __render.apply(this, arguments);
		}
		catch(err) {
			_currentComponent = this._prevComponent;
			throw err;
		}
		return ret;
	};
	this.componentDidMount = function() {
		_currentComponent = this._prevComponent;
		if(__componentDidMount)
			__componentDidMount.apply(this, arguments);
	};
	this.componentDidUpdate = function() {
		_currentComponent = this._prevComponent;
		if(__componentDidUpdate)
			__componentDidUpdate.apply(this, arguments);
	};

	var __componentWillMount = this.componentWillMount;
	this.componentWillMount = function() {
		var i, attr, args, value, prevComponent, guid, state = this.state;
		// Initialize computed state and any initial state from mixins
		if(this._mixinState)
			extendObj(state, this._mixinState);
		for(attr in state) {
			value = state[attr];
			if(typeof value === 'function' && value._computed) {
				args = value._args;
				prevComponent = _currentComponent;
				_currentComponent = this;
				try {
					for(i = 0; i < args.length; ++i) {
						// Setup as proxy setting the name of the (property @ arg number) as the guid for each bound argument
						guid = attr + '@' + i;
						this._boundGUIDProxies[guid] = value;
						bind(args[i], guid);
					}
					// Run once to set the initial state
					value.call(this, attr);
				}
				finally {
					_currentComponent = prevComponent;
				}
			}
		}
		if(__componentWillMount)
			__componentWillMount.apply(this, arguments);
	};

	// Wrap componentWillReceiveProps to automatically check for model and collection updates as props
	var __componentWillReceiveProps = this.componentWillReceiveProps;
	this.componentWillReceiveProps = function(props) {
		if(props.model)
			this.setModel(props.model);
		if(props.collection)
			this.setCollection(props.collection);
		if(__componentWillReceiveProps)
			__componentWillReceiveProps.apply(this, arguments);
	};
	// Set the initial model or collection
	if(props.model)
		this.setModel(props.model);
	if(props.collection)
		this.setCollection(props.collection);
};
Cord.Component.prototype = Object.create(Component.prototype);
Cord.Component.prototype.constructor = Cord.Component;

// Extend Component with data binding methods without backwards compatibility Event functions (bind/unbind)
extendObj(Cord.Component.prototype, Cord.Binding, Backbone.Events);
delete Cord.Component.prototype.bind;
delete Cord.Component.prototype.unbind;

Cord.Component.prototype.setState = function(state, callback) {
	if(typeof state === 'function')
		state = state(this.state, this.props);
	for(var key in state) {
		if(this._hasObservers('this', key))
			this._invokeObservers('this', key, state[key]);
	}
	__setState.call(this, state, callback);
};

// Wrap setCollection to rerender on a new collection
var __setCollection = Cord.Component.prototype.setCollection;
Cord.Component.prototype.setCollection = function(newCollection) {
	if(this.collection === newCollection)
		return this;
	__setCollection.apply(this, arguments);
	var rerender = function() {
		__setState.call(this, {});
	};
	this.listenTo(newCollection, 'add remove sort reset', rerender);
	rerender.call(this);
};

// Cleanup code for all components
var __beforeUnmount = options.beforeUnmount;
options.beforeUnmount = function(component) {
	// Observer cleanup
	if(component.stopObserving)
		component.stopObserving();
	// BB event cleanup
	if(component.stopListening)
		component.stopListening();
	if(__beforeUnmount)
		__beforeUnmount.apply(this, arguments);
};

function _testBindingFeedback(el) {
	// Prevent two-way data binding from creating an infinite feedback loop through dispatching events
	if(!el.hasAttribute(_DATA_FEEDBACK_ATTR))
		return false;
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

function _bindingProxy(guid, key, value) {
	var el = document.body.querySelector('[' + _DATA_BINDING_ATTR + '="' + guid + '"]');
	if(!el || _testBindingFeedback(el))
		return;
	encodeValue(el, value);
}

function _createValueListener(key, wrapped) {
	return function(e) {
		var el = e.currentTarget;
		if(_testBindingFeedback(el))
			return;
		this.setValueForKey(key, decodeValue(el));
		if(wrapped)
			wrapped(e);
	}.bind(_currentComponent);
}

var __vnode = options.vnode;
options.vnode = function(vnode) {
	// vnode contains: nodeName, children (one item or array), attributes, key
	var i, j, child, strings, matches, spliceArgs, key, value;
	var children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
	var attrs = vnode.attributes || {};

	if(!attrs.raw) {
		for(i = children.length - 1; i >= 0; --i) {
			child = children[i];
			if(typeof child === 'string') {
				strings = child.split(regex.variableSearch);
				if(strings.length > 1) {
					spliceArgs = [i, 1];
					matches = child.match(regex.variableSearch);
					for(j = 0; j < matches.length; ++j) {
						if(strings[j].length)
							spliceArgs.push(strings[j]);
						// Force to a string because it is what preact expects
						spliceArgs.push(convertToString(bind(regex.variableValue.exec(matches[j])[1])));
					}
					if(strings[j].length)
						spliceArgs.push(strings[j]);
					Array.prototype.splice.apply(children, spliceArgs);
				}
			}
		}
		vnode.children = children;
	}
	else {
		delete attrs.raw;
	}

	// If nodeName is a function then allow the special props to just pass through
	if(typeof vnode.nodeName !== 'function') {

		// The attr bind is shorthand for both observe and change
		if(attrs.bind) {
			attrs.observe = attrs.bind;
			attrs.change = attrs.bind;
			delete attrs.bind;
		}

		var databind = attrs.observe || attrs.change || attrs.input;
		if(databind) {
			var guid = _bindGUID(vnode.key || attrs.name || databind, _bindingProxy);

			if(!guid) {
				delete attrs.observe;
				delete attrs.change;
				delete attrs.input;
			}
			else {
				attrs[_DATA_BINDING_ATTR] = guid;

				// Observer binding to set the value
				if(attrs.observe) {
					value = bind(attrs.observe, guid);
					delete attrs.observe;
					// Set the initial value on a delayed callback
					setImmediate(_bindingProxy.bind(null, guid, null, value));
					// If two-way this element is sensitive to binding feedback
					if(attrs.observe === attrs.change || attrs.observe === attrs.input)
						attrs[_DATA_FEEDBACK_ATTR] = true;
				}

				// Reverse binding on change or input events to listen to changes in the value
				if(attrs.change) {
					attrs.onChange = _createValueListener(attrs.change, attrs.onChange || attrs.onchange);
					delete attrs.change;
				}
				if(attrs.input) {
					attrs.onInput = _createValueListener(attrs.input, attrs.onInput || attrs.oninput);
					delete attrs.input;
				}
			}
		}
	}

	if(!attrs.nobind) {
		// Try to bind each attr if an interpolation key is detected
		for(key in attrs) {
			value = attrs[key];
			if(typeof value === 'string' && value[0] === regex.variable.prefix && value[value.length - 1] === regex.variable.suffix)
				attrs[key] = bind(value.substr(1, value.length - 2));
		}
	}

	if(__vnode)
		__vnode.apply(this, arguments);
};

function _normalizeMixin(mixin) {
	var methods = {};
	var state = {};
	var attr, value;
	var lifecycleMap = {
		initialize: 'componentWillMount',
		remove: 'componentWillUnmount'
	};
	if(mixin.properties) {
		for(attr in mixin.properties) {
			value = mixin.properties[attr];
			if(typeof value === 'function')
				state[attr] = computed(value);
			else if(isPlainObj(value))
				state[attr] = value.get ? computed(value.get) : value.value;
			else state[attr] = value;
		}
	}
	for(attr in mixin) {
		value = mixin[attr];
		if(typeof value === 'function')
			methods[(lifecycleMap[attr] || attr)] = value;
	}
	mixin.methods = methods;
	mixin.state = state;
	mixin._normalized = true;
}

// Add a static mixin method for adding mixins to a Component class
// Calling this should only be done once and will permantently alter the class
// Also should be done before instantiating any objects of the class
Cord.Component.mixin = function() {
	var proto = this.prototype;
	var mixins = arguments;
	var i, mixin, state = {};
	if(!proto._mixinsApplied) {
		for(i = 0; i < mixins.length; ++i) {
			mixin = mixins[i];
			if(typeof mixin === 'string')
				mixin = Cord.mixins[mixin];
			if(!mixin._normalized)
				_normalizeMixin(mixin);
			extendProto(proto, mixin.methods);
			extendObj(state, mixin.state);
		}
		proto._mixinState = state;
		proto._mixinsApplied = true;
	}
};

if(typeof exports === 'object')
	module.exports = Cord;

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)));
