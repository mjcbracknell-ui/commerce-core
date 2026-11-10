import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { HttpError } from './http.js';

const TEXT_EXTENSIONS = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.txt', '.md', '.xml']);

const normalize = (p) => String(p).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '');

/**
 * LiquidJS filesystem backed by an in-memory theme file map
 * (themes are stored as JSON in Postgres so uploads are portable).
 */
class MapFileSystem {
  constructor(files) {
    this.files = files;
    this.sep = '/';
  }

  resolve(root, file, ext) {
    return normalize(`${file}${ext || ''}`);
  }

  existsSync(file) {
    return Object.prototype.hasOwnProperty.call(this.files, normalize(file));
  }

  readFileSync(file) {
    const key = normalize(file);
    if (!(key in this.files)) throw new Error(`Theme file not found: ${key}`);
    return this.files[key];
  }

  contains() {
    return false;
  }

  dirname(file) {
    const dir = normalize(file).split('/').slice(0, -1).join('/');
    return dir || '.';
  }
}

/** Inline {% render 'snippet' %} / {% include 'snippet' %} for theme compatibility. */
export function inlineSnippets(files, content, depth = 0) {
  if (depth > 4 || !content) return content || '';
  return content.replace(
    /\{%-?\s*(?:render|include)\s+['"]([\w./-]+)['"][^%]*-?%\}/g,
    (match, name) => {
      const key = normalize(name).endsWith('.liquid') ? normalize(name) : `snippets/${normalize(name)}.liquid`;
      const snippet = files[key];
      if (snippet == null) return '';
      return inlineSnippets(files, snippet, depth + 1);
    },
  );
}

export const DEFAULT_THEME_FILES = {
  'layout/theme.liquid':
    '<!doctype html><html><head><meta charset="utf-8"><title>{{ page_title | default: shop.name }}</title></head><body>{{ content_for_layout }}</body></html>',
  'templates/index.json': JSON.stringify({ sections: {}, order: [] }, null, 2),
};

function createEngine(files) {
  const engine = new Liquid({
    fs: new MapFileSystem(files),
    extname: '.liquid',
    cache: false,
    strictFilters: false,
    strictVariables: false,
  });
  engine.registerFilter('money', (value, currency = 'USD') => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value) || 0);
    } catch {
      return `$${(Number(value) || 0).toFixed(2)}`;
    }
  });
  return engine;
}

/**
 * Render a theme from its file map.
 * @param {object} options
 * @param {Record<string,string>} options.files theme file map
 * @param {string} options.template template name, e.g. "index" or "product"
 * @param {object} options.data global Liquid data (shop, products, product, ...)
 */
export async function renderTheme({ files, template = 'index', data = {} }) {
  const themeFiles = { ...DEFAULT_THEME_FILES, ...(files || {}) };
  const templateKey = `templates/${template}.json`;

  let config;
  try {
    config = JSON.parse(themeFiles[templateKey] || '{"sections":{},"order":[]}');
  } catch {
    throw new HttpError(500, `Theme template ${templateKey} is not valid JSON`);
  }

  const engine = createEngine(themeFiles);
  const sectionsConfig = config.sections || {};
  const order = Array.isArray(config.order) && config.order.length ? config.order : Object.keys(sectionsConfig);
  const chunks = [];

  for (const key of order) {
    const entry = sectionsConfig[key] || {};
    const type = entry.type || key;
    const sectionFile = themeFiles[`sections/${type}.liquid`];
    if (!sectionFile) continue;
    const scope = {
      ...data,
      section: { id: key, settings: entry.settings || {}, type },
      settings: entry.settings || {},
      blocks: entry.blocks || {},
    };
    chunks.push(await engine.parseAndRender(inlineSnippets(themeFiles, sectionFile), scope));
  }

  const layout = inlineSnippets(themeFiles, themeFiles['layout/theme.liquid'] || DEFAULT_THEME_FILES['layout/theme.liquid']);
  return engine.parseAndRender(layout, {
    ...data,
    page_title: data.page_title || data.shop?.name || 'Store',
    content_for_layout: chunks.join('\n'),
  });
}

/** Load a theme directory from disk into a file map (for the bundled Dawn clone). */
export function loadThemeDirectory(dir) {
  const files = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const key = normalize(path.relative(dir, full));
        files[key] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return files;
}

const THEMES_DIR = process.env.THEMES_DIR
  ? path.resolve(process.env.THEMES_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../themes');

export function loadBundledTheme(name = 'dawn-clone') {
  const dir = path.join(THEMES_DIR, name);
  if (!fs.existsSync(dir)) return null;
  return { name, files: loadThemeDirectory(dir) };
}

export function summarizeTheme(files) {
  return {
    templates: Object.keys(files).filter((f) => f.startsWith('templates/')),
    sections: Object.keys(files).filter((f) => f.startsWith('sections/')),
    snippets: Object.keys(files).filter((f) => f.startsWith('snippets/')),
    files: Object.keys(files).length,
  };
}
