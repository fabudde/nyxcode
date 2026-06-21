/**
 * v0.54 — Native interactive `map` element + `locate` action.
 *
 * Lets apps embed a live, data-driven Leaflet map (with an Overpass data source,
 * reactive filters, and marker popups written in NyxCode) WITHOUT any raw
 * `script {}` escape hatch. This is the feature that makes VeganMaps 100% NyxCode.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Lexer } from '../lexer.js';
import { Compiler } from '../compiler.js';
import * as vm from 'node:vm';

function compile(src: string) {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  return new Compiler().compile(ast);
}

const MAP_SRC = `page "/" {
  state places = []
  state query = ""
  state onlyVegan = true

  input bind="query"
  button "Near me" on:click -> locate
  aside { each places -> place { div { h4 "\${place.name}" } } }

  map center="52.52,13.405" zoom="14" source="overpass" diet="vegan" strict="onlyVegan" search="query" bind="places" tiles="dark" id="map" {
    marker icon="🌱" {
      h3 "\${name}"
      p "\${cuisine}"
      a "Directions" href="https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}"
    }
  }
}`;

describe('v0.54: native map element', () => {
  const out = compile(MAP_SRC);
  const html = out.html;

  it('auto-injects the Leaflet CSS + JS once', () => {
    assert.equal((html.match(/leaflet@1\.9\.4\/dist\/leaflet\.css/g) || []).length, 1);
    assert.equal((html.match(/leaflet@1\.9\.4\/dist\/leaflet\.js/g) || []).length, 1);
  });

  it('renders a map container div with the given id', () => {
    assert.ok(/<div id="map" class="nyx-map"/.test(html), 'map container should exist');
  });

  it('emits a live Overpass data source over the map bounds', () => {
    assert.ok(html.includes('overpass-api.de/api/interpreter'), 'should fetch Overpass');
    assert.ok(html.includes('out center tags'), 'should request center+tags');
    assert.ok(html.includes('getBounds'), 'should query by map bounds');
    assert.ok(html.includes("moveend"), 'should refetch on pan/zoom');
  });

  it('publishes normalized results to the bound state (for native lists)', () => {
    assert.ok(html.includes('"places"]=list') || html.includes("'places']=list"), 'should publish to places state');
  });

  it('wires reactive strict + search bindings', () => {
    assert.ok(html.includes("subscribe('onlyVegan'") || html.includes('subscribe("onlyVegan"'), 'strict reactive');
    assert.ok(html.includes("subscribe('query'") || html.includes('subscribe("query"'), 'search reactive');
  });

  it('compiles the marker popup template to escaped place fields', () => {
    assert.ok(html.includes('__mEsc(p['), 'popup should escape place fields');
    assert.ok(html.includes('maps/dir/?api=1'), 'popup keeps the directions link');
  });

  it('generates syntactically valid JavaScript (no raw script hacks needed)', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0);
    for (const s of scripts) {
      assert.doesNotThrow(() => new vm.Script(s), 'generated map JS must be valid');
    }
  });

  it('does NOT require a user-authored script block', () => {
    // The source has zero `script {`; all interactivity is compiler-generated.
    assert.ok(!MAP_SRC.includes('script {'), 'app source must contain no escape hatch');
  });
});

describe('v0.54: locate action', () => {
  it('compiles `on:click -> locate` to a geolocation recenter', () => {
    const { html } = compile(
      `page "/" {\n  button "Near me" on:click -> locate\n  map id="m" source="overpass" diet="vegan" { marker { h3 "\${name}" } }\n}`,
    );
    assert.ok(html.includes('getCurrentPosition'), 'should call geolocation');
    assert.ok(html.includes('__nyxMaps'), 'should target the native map registry');
  });
});
