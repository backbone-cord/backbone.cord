;(function(Backbone) {
'use strict';

Backbone.Cord.formats = {
	url: /^(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i,
	ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i,
	email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
	slug: /^[a-z0-9-]+$/i,
	username: /^[a-z0-9_@\-\+\.]{3,150}$/i,
	color: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i
};

Backbone.Cord.validate = function(value, rule) {
	var i, format, formats, type = rule.type.split(' ')[0];
	if(value === null || (value === '' && rule.type === 'string'))
		return rule.required ? 'required' : true;
	if((type === 'string' && typeof(value) !== 'string') ||
		(type === 'date' && !(value instanceof Date)) ||
		(type === 'int' && !(+value === value && !(value % 1))) ||
		(type === 'float' && typeof(value) !== 'number') ||
		(type === 'bool' && typeof(value) !== 'boolean') ||
		(type === 'array' && !Array.isArray(value)) ||
		(type === 'model' && !(value instanceof Backbone.Model))
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
						format = Backbone.Cord.formats[format];
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

Backbone.Cord.parseValidationError = function(value, rule, error, title) {
	// Override to provide custom error messages based on error strings
	var len = rule.type === 'string' ? 'The length of ' : '';
	switch(error) {
		case 'required':
			return title + ' is required';
		case 'min':
			return len + title + ' must be greater than or equal to ' + rule.min;
		case 'max':
			return len + title + ' must be less than or equal to ' + rule.max;
		default:
			return title + ' is not valid';
	}
};

Backbone.Cord.mixins.validation = {
	properties: {
		allErrors: { readonly: true },
		latestError: { readonly: true },
		isValid: function(allErrors) { return !allErrors || !allErrors.length; }
	},
	initialize: function() {
		this.errors = new Backbone.Model();
		this.listenTo(this.errors, 'change', function(model) {
			var key, changed = model.changedAttributes();
			if(!changed)
				return;
			for(key in changed) {
				if(changed.hasOwnProperty(key))
					this._invokeObservers('errors', key, changed[key]);
			}
		});
		this._addInvalidListener(this.model);
	},
	setModel: function(newModel) {
		this._addInvalidListener(newModel);
	},
	_addInvalidListener: function(model) {
		if(model !== Backbone.Cord.EmptyModel)
			this.listenTo(model, 'invalid', this._onInvalid);
	},
	_onInvalid: function(model, validationErrors) {
		var attr, errors, allErrors, latestError, changed;

		for(attr in validationErrors) {
			if(validationErrors.hasOwnProperty(attr)) {
				// Convert all validationErrors to error messages
				if(validationErrors[attr] === 'format' && this.model.formats && this.model.formats[attr])
					latestError = this.model.formats[attr];
				else
					latestError = Backbone.Cord.parseValidationError(this.model.get(attr), this.model.rules[attr], validationErrors[attr], this.model.titles[attr], attr);
				this.errors.set(attr, latestError);
			}
		}
		changed = this.model.changedAttributes();
		for(attr in changed) {
			// Anything in the changedAttributes but not in the validationErrors should be cleared
			if(changed.hasOwnProperty(attr) && !validationErrors.hasOwnProperty(attr))
				this.errors.unset(attr);
		}
		allErrors = [];
		errors = this.errors.attributes;
		for(attr in errors) {
			if(errors.hasOwnProperty(attr))
				allErrors.push(errors[attr]);
		}
		this.allErrors = new Backbone.Cord.ForceValue(allErrors);
		this.latestError = new Backbone.Cord.ForceValue(latestError);
	},
	_onValid: function() {
		// Use code within _onInvalid to clear previous error messages
		this._onInvalid(this.model, []);
	}
};

Backbone.Cord.mixins.validateOnBlur = {
	initialize: function() {
		this._addBlurListener(this.model);
	},
	setModel: function(newModel) {
		this._addBlurListener(newModel);
	},
	_addBlurListener: function(model) {
		if(model !== Backbone.Cord.EmptyModel) {
			model.listen('change', function() {
				if(this.model.validate(this.model.changedAttributes()))
					this._onValid(this.model, []);
			});
		}
	}
};

Backbone.Cord.mixins.validateOnSubmit = {
	events: {
		'submit form': function(e) {
			if(this.model.isValid())
				this._onValid(this.model, []);
			else
				return false;
		}
	}
};

Backbone.Model.prototype.validate = function(attributes) {
	var attr, rule, ret, errors = {};
	for(attr in attributes) {
		if(attributes.hasOwnProperty(attr)) {
			rule = this.rules[attr];
			if(rule) {
				if(rule.equals === null && rule.equals === void(0))
					rule.equals = this.choices && this.choices[attr];
				ret = Backbone.Cord.validate(attributes[attr], rule);
				if(ret !== true)
					errors[attr] = ret;
			}
		}
	}
	// Custom validation can also add to the errors object
	if(this.extendedValidate)
		this.extendedValidate(errors);
	if(Object.keys(errors).length)
		return errors;
}

Backbone.Cord.plugins.push({
	name: 'validation',
	scope: {
		namespace: 'errors',
		observe: function() {},
		unobserve: function() {},
		getValue: function(key) { return this.errors.get(key); },
		setValue: function() {}
	}
});

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
