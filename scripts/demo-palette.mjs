import React from 'react';
import { render } from 'ink-testing-library';
import { CommandPalette } from '../dist/ui/CommandPalette.js';
import { COMMANDS } from '../dist/lib/commands.js';

const items = [
  { id: 'go:#general', label: 'Go to #general', hint: 'channel', run: () => {} },
  { id: 'go:#dev', label: 'Go to #dev', hint: 'channel', run: () => {} },
  ...COMMANDS.map((c) => ({ id: 'cmd:' + c.name, label: '/' + c.name, hint: c.help, run: () => {} })),
];

const { lastFrame, stdin } = render(
  React.createElement(CommandPalette, { items, onClose: () => {} }),
);
stdin.write('jo'); // filter
setTimeout(() => {
  console.log(lastFrame());
  process.exit(0);
}, 100);
