## Testing

Run tests with:

```
npx jest
```

## Book

Prereq:

- Install [mdbook](https://github.com/rust-lang/mdBook)

Development:

1. start mdbook in watch mode:
   ```
   mdbook watch ./book
   ```
1. start webpack in watch mode:
   ```
   npx webpack serve
   ```
1. go to http://localhost:8080

## Scripts

Compile a grammar to typescript

```bash
./bin/snax-parser-gen --grammar=<path/to/grammar>
```
