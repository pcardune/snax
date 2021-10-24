'use strict';

const e = React.createElement;
function Param({ name, value, onChange }) {
  const handleChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      onChange(value);
    }
  };
  return e(
    'div',
    { className: 'param pure-control-group' },
    e('label', {}, `${name} = `),
    e('input', {
      type: 'number',
      value,
      onChange: handleChange,
    }),
    e('input', {
      type: 'range',
      value,
      onChange: handleChange,
      min: -2,
      max: 2,
      step: 0.01,
    })
  );
}
function CliffordForm({ wasmInstance }) {
  const [params, setParams] = React.useState({
    a: -1.4,
    b: 1.6,
    c: 1.0,
    d: 0.7,
  });

  const [elapsed, setElapsed] = React.useState(0);

  const [error, setError] = React.useState('');

  const numIterations = 1000000;

  React.useEffect(() => {
    try {
      wasmInstance._start(); // TODO: make this not necessary
      const start = new Date().getTime();
      wasmInstance.clifford(
        params.a,
        params.b,
        params.c,
        params.d,
        numIterations
      );
      setElapsed(new Date().getTime() - start);
      setError('');
      window.location.hash = JSON.stringify(params);
    } catch (e) {
      setError(String(e));
    }
  }, [params, wasmInstance]);

  return e(
    'form',
    { className: 'pure-form' },
    e(
      'div',
      {},
      e('h4', null, 'Parameters'),
      Object.entries(params).map(([name, value]) =>
        e(
          'fieldset',
          { key: name },
          e(Param, {
            name,
            value,
            onChange: (newVal) => setParams({ ...params, [name]: newVal }),
          })
        )
      ),
      error
        ? error
        : elapsed
        ? e('p', {}, `rendered 1,000,000 iterations in ${elapsed}ms`)
        : null
    )
  );
}

const canvasEl = document.getElementById('canvas');

let wasmInstance;

const importObject = {
  console: {
    draw(imageDataPtr, width, height) {
      const data = new Uint8ClampedArray(
        wasmInstance.memory.buffer.slice(
          imageDataPtr,
          imageDataPtr + width * height * 4
        )
      );
      const imageData = new ImageData(data, width);
      canvasEl.width = width;
      canvasEl.height = height;
      canvasEl.getContext('2d').putImageData(imageData, 0, 0);
    },
  },
};

const loadWasm = fetch('clifford.wasm');

const modPromise = WebAssembly.instantiateStreaming
  ? WebAssembly.instantiateStreaming(loadWasm, importObject)
  : loadWasm
      .then((res) => res.arrayBuffer())
      .then((bytes) => WebAssembly.instantiate(bytes, importObject));
modPromise
  .then((obj) => {
    wasmInstance = obj.instance.exports;
    ReactDOM.render(
      e(CliffordForm, { wasmInstance }),
      document.querySelector('#container')
    );
  })
  .catch((e) => {
    document.body.innerHTML = `
      <p class="l-box">
        <strong>Error:</strong> ${e}
      </p>
      <p class="l-box">
      If you are seeing this, you probably need to update your browser.<br />
      </p>
    `;
  });
