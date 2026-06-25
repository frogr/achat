import React from 'react';
import { render } from 'ink-testing-library';
import { CommandPalette } from '../dist/ui/CommandPalette.js';
const items = [
  { id:'msg', label:'Message austn', hint:'open a private query', run:()=>{} },
  { id:'whois', label:'Whois austn', hint:'look up this user', run:()=>{} },
  { id:'mention', label:'Mention austn', hint:'insert into the input', run:()=>{} },
];
const { lastFrame } = render(React.createElement(CommandPalette, { title:'user · austn', items, onClose:()=>{} }));
setTimeout(()=>{ console.log(lastFrame()); process.exit(0); }, 80);
