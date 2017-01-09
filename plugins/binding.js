;(function(Backbone) {
'use strict';

var _VALUE_DECODERS = {
	range: function(el) { return parseInt(el.value); },
	number: function(el) { return Number(el.value); },
	integer: function(el) { return parseInt(el.value); },
	decimal: function(el) { return parseFloat(el.value); },
	date: function(el) { return new Date(el.value); },
	datetime: function(el) { return new Date(el.value); },
	checkbox: function(el) { return el.checked; }
};

var _VALUE_ENCODERS = {
	date: function(el, value) { el.value = value.toDateString(); },
	datetime: function(el, value) { el.value = value.toString(); },
	checkbox: function(el, value) { el.checked = Backbone.Cord.convertToBool(value); }
};

var _ATTR_PROPERTIES = {
	innerHTML: true,
	value: true,
	checked: true
};

var _DATA_BINDING_ATTR = 'data-binding';
var _currentBinding = null;

function _dispatchChangeEvent(el) {
	if(Backbone.Cord.config.dispatchValueChangeEvents) {
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('change', true, true);
		el.dispatchEvent(evt);
	}
}

function _createAttrObserver(el, attr) {
	if(_ATTR_PROPERTIES[attr])
		return function(key, formatted) {
			el[attr] = Backbone.Cord.convertToString(formatted);
			if(attr !== 'innerHTML')
				_dispatchChangeEvent(el);
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
		var encoder = _VALUE_ENCODERS[el.getAttribute('data-type') || el.getAttribute('type')];
		if(encoder)
			encoder(el, value);
		else
			el.value = Backbone.Cord.convertToString(value);
		_dispatchChangeEvent(el);
	};
}

function _createValueListener(el, key) {
	return function() {
		if(_testBindingFeedback(el))
			return;
		var decoder = _VALUE_DECODERS[el.getAttribute('data-type') || el.getAttribute('type')];
		this.setValueForKey(key, decoder ? decoder.call(this, el) : el.value);
	};
}

Backbone.Cord.plugins.push({
	name: 'binding',
	requirements: ['interpolation'],
	config: {
		dispatchValueChangeEvents: true
	},
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
