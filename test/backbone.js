const assert = require('assert');
const jsdom = require('jsdom');
const _ = require('lodash');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

assert.element = (el, tagName, id, classes, attrs) => {
	assert.equal(el.nodeType, 1);
	assert.equal(el.tagName.toLowerCase(), tagName.toLowerCase());
	if(id)
		assert.equal(el.getAttribute('data-id'), id);
	if(classes) {
		_.each(classes, (cls) => {
			assert(el.classList.contains(cls));
		});
	}
};

assert.text = (e, text) => {
	assert.equal(e.nodeType, 3);
	assert.equal(e.data, text);
};

describe('events', () => {
	let View;
	before(() => {
		View = Backbone.View.extend({
			events: {
				'click #element': true
			}
		});
	});
	it('should replace id selectors on extend', () => {
		assert.equal(View.prototype.events['click [data-id="element-' + View.prototype.vuid + '"]'], true);
	});
});

describe('createElement', () => {
	before(function(done) {
		// Run the tests with a document
		jsdom.env('', function (err, window) {
			global.document = window.document;
			done(err);
		});
	});
	describe('createElement(tag#id.classes)', () => {
		it('should return <div></div>', () => assert.element(Backbone.Cord.createElement(''), 'div'));
		it('should return <div id="dog"></div>', () => assert.element(Backbone.Cord.createElement('#dog'), 'div', 'dog'));
		it('should return <input id="dog" class="black fluffy"></div>', () => assert.element(Backbone.Cord.createElement('input#dog.black.fluffy'), 'input', 'dog', ['black', 'fluffy']));
		it('should return <div id="dog">jumped over the fence</div>', () => {
			let el = Backbone.Cord.createElement('#dog', 'jumped over the fence');
			assert.equal(el.outerHTML, '<div data-id="dog">jumped over the fence</div>');
			assert.element(el, 'div', 'dog');
			assert.text(el.childNodes[0], 'jumped over the fence');
		});
		// JSX compatible id and class as attributes
		it('should apply id and class from attrs <div id="dog" class="fluffy"></div>', () => assert.element(Backbone.Cord.createElement('div', {id: 'dog', class:'fluffy'}), 'div', 'dog', ['fluffy']));
	});
});

// TODO: maybe prevent the createSubview method from being called outside of a View
describe('createSubview', () => {});
