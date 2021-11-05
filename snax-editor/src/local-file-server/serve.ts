import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import bodyParser from 'body-parser';

const port = 8085;

const app = express();

app.use(cors());
app.use(bodyParser.text());

export type FileInfo = {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
};

export type DirListing = {
  files: FileInfo[];
};

const ROOT_DIR = process.env.ROOT_DIR
  ? path.resolve(process.env.ROOT_DIR)
  : process.cwd();

console.log('Root dir is:', ROOT_DIR);

function pathForRequest(req: express.Request) {
  return path.join(ROOT_DIR, req.url);
}

app.get(/.*/, async (req, res) => {
  const myDir = pathForRequest(req);

  let dirStat;
  try {
    dirStat = await fs.stat(myDir);
  } catch (e) {
    res.status(404).send(`No accessable file at ${myDir}`);
    return;
  }
  if (dirStat.isDirectory()) {
    const dir = await fs.readdir(myDir);
    const files = await Promise.all(
      dir.map(async (fn): Promise<FileInfo> => {
        const stat = await fs.stat(path.join(myDir, fn));
        return {
          name: fn,
          isDirectory: stat.isDirectory(),
          size: stat.size,
          mtime: stat.mtime.getTime(),
        };
      })
    );
    res.json({
      dir: myDir,
      files,
    });
  } else if (dirStat.isFile()) {
    res.sendFile(myDir, {
      headers: {
        'Last-Modified': dirStat.mtime.toUTCString(),
      },
    });
  } else {
    res.status(404).send(`No file at ${myDir}`);
  }
});

app.post(/.*/, async (req, res) => {
  const filePath = pathForRequest(req);
  try {
    await fs.writeFile(filePath, req.body);
  } catch (e) {
    res.status(500).send(String(e));
  }
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
