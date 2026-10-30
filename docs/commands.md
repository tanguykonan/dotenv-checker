<h1>CLI Commands</h1>


<h2 align="center">Synopsis</h2>

```bash
dotenv-checker [options]
node src/cli.js [options]
npm start -- [options]
```

---

<h2 align="center">Options</h2>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
  <thead>
    <tr bgcolor="#000000">
      <th>Flag</th>
      <th>Type</th>
      <th>Default</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>--dir</code></td>
      <td>string</td>
      <td><code>.</code></td>
      <td>Root directory to scan</td>
    </tr>
    <tr>
      <td><code>--env</code></td>
      <td>string</td>
      <td><code>.env</code></td>
      <td>Target environment file</td>
    </tr>
    <tr>
      <td><code>--example</code></td>
      <td>string</td>
      <td><code>.env.example</code></td>
      <td>Reference template file</td>
    </tr>
    <tr>
      <td><code>--compare</code></td>
      <td>file1 file2</td>
      <td>-</td>
      <td>Compares two env files directly</td>
    </tr>
    <tr>
      <td><code>--fix</code></td>
      <td>boolean</td>
      <td><code>false</code></td>
      <td>Synchronizes missing variables across files</td>
    </tr>
    <tr>
      <td><code>--dry-run</code></td>
      <td>boolean</td>
      <td><code>false</code></td>
      <td>Simulates fixes without modifying files</td>
    </tr>
    <tr>
      <td><code>--backup</code></td>
      <td>boolean</td>
      <td><code>false</code></td>
      <td>Creates a .env.bak copy before writing</td>
    </tr>
    <tr>
      <td><code>--json</code></td>
      <td>boolean</td>
      <td><code>false</code></td>
      <td>Outputs machine-readable JSON</td>
    </tr>
    <tr>
      <td><code>--verbose</code>, <code>-v</code></td>
      <td>boolean</td>
      <td><code>false</code></td>
      <td>Shows valid and shared variables</td>
    </tr>
    <tr>
      <td><code>--version</code>, <code>-V</code></td>
      <td>boolean</td>
      <td>-</td>
      <td>Displays version number</td>
    </tr>
    <tr>
      <td><code>--help</code>, <code>-h</code></td>
      <td>boolean</td>
      <td>-</td>
      <td>Displays help information</td>
    </tr>
  </tbody>
</table>

---

<h2 align="center">Commands</h2>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
  <thead>
    <tr bgcolor="#000000">
      <th>Command</th>
      <th>Usage</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>dotenv-checker</code></td>
      <td>Scans workspace for all env files</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --dir ./backend</code></td>
      <td>Scans specific subfolder</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --verbose</code></td>
      <td>Shows valid keys alongside issues</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --version</code></td>
      <td>Prints installed version number</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --json</code></td>
      <td>Prints output in JSON format</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --fix</code></td>
      <td>Synchronizes missing keys across all files</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --fix --dry-run</code></td>
      <td>Previews fix results with zero disk writes</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --fix --backup</code></td>
      <td>Creates .bak copies before applying fixes</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --env .env.local --example .env.example</code></td>
      <td>Validates specific pair of files</td>
    </tr>
    <tr>
      <td><code>dotenv-checker --compare .env.staging .env.production</code></td>
      <td>Diffs two environments side by side</td>
    </tr>
  </tbody>
</table>

---

<h2 align="center">Exit Codes</h2>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
  <thead>
    <tr bgcolor="#000000">
      <th>Code</th>
      <th>Status</th>
      <th>Meaning</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>0</code></td>
      <td>Success</td>
      <td>Zero issues detected</td>
    </tr>
    <tr>
      <td><code>1</code></td>
      <td>Failure</td>
      <td>One or more discrepancies detected</td>
    </tr>
    <tr>
      <td><code>2</code></td>
      <td>Error</td>
      <td>Missing file or invalid argument</td>
    </tr>
  </tbody>
</table>
