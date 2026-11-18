import React from 'react';
import { render, Text, useInput } from 'ink';
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const file = process.argv[2];
function App() {
  useInput((input, key) => appendFileSync(file, `ink:${JSON.stringify({ input, escape: key.escape })}\n`));
  return React.createElement(Text, null, 'Simulated input probe');
}
const app = render(React.createElement(App), { exitOnCtrlC: false });
const child = spawn('python3', ['-c', 'import os,sys; f=open("/dev/tty","rb",buffering=0); print("Password:",flush=True); data=f.read(8); open(sys.argv[1],"a").write("child:"+data.hex()+"\\n")', file], { stdio: ['inherit', 'inherit', 'inherit'] });
setTimeout(() => { child.kill(); app.unmount(); process.exit(0); }, 900);
