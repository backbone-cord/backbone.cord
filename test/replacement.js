var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('replacement plugin', function() {
	var view;
	before(function() {

		Backbone.Cord.addReplacement('paragraph', function(el) {
			return this._el('p.paragraph.replaced');
		});

		Backbone.Cord.addReplacement('widget', function() {
			var fragment = document.createDocumentFragment();
			fragment.appendChild(this._el('label.replaced2'));
			fragment.appendChild(this._el('input.replaced3'));
			return fragment;
		});

		Backbone.Cord.addReplacement('div.complex.selector[data-test="dog"]', function() {
			return this._el('h1');
		});

		view = new (Backbone.View.extend({
			el: function(h) {
				return h('', h('.complex.selector', {'data-test': 'dog'}));
			},
			replacements: Backbone.Cord.compileReplacements({
				'div.complex.selector[data-test="dog"]': function() {
					return this._el('h5');
				}
			})
		}))();
	});
	describe('paragraph', function() {
		it('paragraph should be p with className "paragraph replaced"', function() {
			var el = Backbone.Cord._el('paragraph');
			assert.equal(el.tagName, 'P');
			assert.equal(el.className, 'paragraph replaced');
		});
	});
	describe('widget', function() {
		it('el.children should contain two', function() {
			var el = Backbone.Cord._el('widget');
			assert.equal(el.childNodes.length, 2);
		});
	});
	describe('complex selector', function() {
		it('.complex.selector[data-test="dog"] should get replaced with h1', function() {
			var el = Backbone.Cord._el('.complex.selector', {'data-test': 'dog', 'data-pet': 'true'});
			assert.equal(el.tagName, 'H1');
		});
		it('.complex.selector[data-test="puppy"] should NOT get replaced with h1', function() {
			var el = Backbone.Cord._el('.complex.selector', {'data-test': 'puppy'});
			assert.notEqual(el.tagName, 'H1');
		});
	});
	describe('noreplace attribute', function() {
		it('.complex.selector[data-test="dog"] should NOT get replaced with h1', function() {
			var el = Backbone.Cord._el('.complex.selector', {'data-test': 'dog', 'data-pet': 'true', 'noreplace': 'true'});
			assert.notEqual(el.tagName, 'H1');
		});
	});
	describe('view local replacements', function() {
		it('.complex.selector[data-test="dog"] should get replaced with h5', function() {
			assert.equal(view.el.children[0].tagName, 'H5');
		});
	});
});
