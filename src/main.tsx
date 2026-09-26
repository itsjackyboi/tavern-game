import { render } from 'preact';
import { loadContent } from './content/index.ts';
import { App } from './ui/root.tsx';
import './ui/styles.css';

const content = loadContent();
const root = document.getElementById('app');
if (!root) throw new Error('#app missing');
root.textContent = ''; // clear the inline loading screen
render(<App content={content} />, root);
