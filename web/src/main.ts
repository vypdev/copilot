import App from './App.svelte';
import './style.css';
import { mount } from 'svelte';

mount(App, { target: document.getElementById('app')! });
