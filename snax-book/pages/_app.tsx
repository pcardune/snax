import '../styles/variables.css';
import '../styles/general.css';
import '../styles/chrome.css';
// TODO: enable this only for printing?
// import "../styles/print.css";

import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ThemeProvider, DefaultTheme } from 'styled-components';
import GlobalStyle from '../components/styles/GlobalStyles.jsx';

const theme: DefaultTheme = {
  colors: {
    primary: '#111',
    secondary: '#0070f3',
  },
};

type Section = {
  title: string;
  path: string;
  noNumber?: true;
  children?: Section[];
};

const links: Section[] = [
  { title: 'Introduction', path: '/', noNumber: true },
  // {
  //   title: 'Regular Expressions',
  //   path: '/regex',
  //   children: [
  //     { title: 'Finite Automata', path: '/regex/finite_automata' },
  //     { title: 'Regex to NFA', path: '/regex/regex_to_nfa' },
  //   ],
  // },
  // {
  //   title: 'Parsing',
  //   path: '/parsing',
  //   children: [
  //     { title: 'Grammars', path: '/parsing/grammars' },
  //     { title: 'Syntax Directed Definitions (SDD)', path: '/parsing/sdd' },
  //     { title: 'LL1 Parsing', path: '/parsing/LL1' },
  //   ],
  // },
  {
    title: 'The Snax Language',
    path: '/snax',
    children: [
      { title: 'Numbers', path: '/snax/numbers' },
      { title: 'Strings', path: '/snax/strings' },
      { title: "Compiler Functions", path: '/snax/compiler-functions'},
    ],
  },
  {
    title: 'Standard Library',
    path: '/stdlib',
    children: [
      { title: 'math', path: '/stdlib/math' },
      { title: 'string', path: '/stdlib/string' },
      { title: 'memory', path: '/stdlib/memory' },
      { title: 'io', path: '/stdlib/io' },
    ],
  },
  {
    title: 'The Snax Compiler',
    path: '/compiler',
    children: [{ title: 'Parsing', path: '/compiler/parsing' }],
  },
];

function Links(props: { section: Section; label: string }) {
  const { section, label } = props;
  const router = useRouter();

  return (
    <>
      <li key="root" className="chapter-item expanded affix">
        <Link
          href={section.path}
          className={router.pathname === section.path ? 'active' : ''}
        >
          {label && <strong>{label} </strong>}
          {section.title}
        </Link>
      </li>
      {section.children && section.children.length > 0 && (
        <ol className="section">
          {section.children.map((child, i) => (
            <Links key={i} section={child} label={label + `${i + 1}.`} />
          ))}
        </ol>
      )}
    </>
  );
}

function Nav() {
  let num = 1;
  const linkEls = links.map((section, i) => {
    const label = section.noNumber ? '' : `${num++}.`;
    return <Links key={i} section={section} label={label} />;
  });
  return (
    <nav className="sidebar" id="sidebar">
      <div className="sidebar-scrollbox">
        <ol className="chapter">{linkEls}</ol>
      </div>
    </nav>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <div className="sidebar-visible light">
        <Head>
          <title>Snax</title>
          <meta name="description" content="The Snax Progamming Language" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <Nav />
        <div id="page-wrapper" className="page-wrapper">
          <div className="page">
            <div id="menu-bar-hover-placeholder"></div>
            <div id="menu-bar" className="menu-bar sticky bordered">
              <div className="left-buttons">
                <button
                  id="sidebar-toggle"
                  className="icon-button"
                  type="button"
                  title="Toggle Table of Contents"
                  aria-label="Toggle Table of Contents"
                  aria-controls="sidebar"
                >
                  <i className="fa fa-bars"></i>
                </button>
                <button
                  id="theme-toggle"
                  className="icon-button"
                  type="button"
                  title="Change theme"
                  aria-label="Change theme"
                  aria-haspopup="true"
                  aria-expanded="false"
                  aria-controls="theme-list"
                >
                  <i className="fa fa-paint-brush"></i>
                </button>
                <ul
                  id="theme-list"
                  className="theme-popup"
                  aria-label="Themes"
                  role="menu"
                >
                  <li role="none">
                    <button role="menuitem" className="theme" id="light">
                      Light (default)
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="theme" id="rust">
                      Rust
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="theme" id="coal">
                      Coal
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="theme" id="navy">
                      Navy
                    </button>
                  </li>
                  <li role="none">
                    <button role="menuitem" className="theme" id="ayu">
                      Ayu
                    </button>
                  </li>
                </ul>
                <button
                  id="search-toggle"
                  className="icon-button"
                  type="button"
                  title="Search. (Shortkey: s)"
                  aria-label="Toggle Searchbar"
                  aria-expanded="false"
                  aria-keyshortcuts="S"
                  aria-controls="searchbar"
                >
                  <i className="fa fa-search"></i>
                </button>
              </div>

              <h1 className="menu-title">Snax</h1>

              <div className="right-buttons">
                <a
                  href="print.html"
                  title="Print this book"
                  aria-label="Print this book"
                >
                  <i id="print-button" className="fa fa-print"></i>
                </a>
              </div>
            </div>

            <div id="search-wrapper" className="hidden">
              <form id="searchbar-outer" className="searchbar-outer">
                <input
                  type="search"
                  id="searchbar"
                  name="searchbar"
                  placeholder="Search this book ..."
                  aria-controls="searchresults-outer"
                  aria-describedby="searchresults-header"
                />
              </form>
              <div
                id="searchresults-outer"
                className="searchresults-outer hidden"
              >
                <div
                  id="searchresults-header"
                  className="searchresults-header"
                ></div>
                <ul id="searchresults"></ul>
              </div>
            </div>
            <div id="content" className="content">
              <main>
                <Component {...pageProps} />
              </main>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
export default MyApp;
