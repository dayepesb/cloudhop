// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// Published on GitHub Pages: https://dayepesb.github.io/cloudhop
export default defineConfig({
  site: 'https://dayepesb.github.io',
  base: '/cloudhop',
  integrations: [
    starlight({
      title: 'cloudhop',
      description: 'Hop between cloud accounts, roles and regions with one command.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/dayepesb/cloudhop' }],
      editLink: { baseUrl: 'https://github.com/dayepesb/cloudhop/edit/main/docs/' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
      },
      sidebar: [
        {
          label: 'Start here',
          translations: { es: 'Empieza aquí' },
          items: [{ slug: 'getting-started' }],
        },
        {
          label: 'Guides',
          translations: { es: 'Guías' },
          items: [{ slug: 'guides/aws-sso' }, { slug: 'guides/personal-accounts' }],
        },
        {
          label: 'Reference',
          translations: { es: 'Referencia' },
          items: [{ slug: 'reference/commands' }, { slug: 'reference/architecture' }],
        },
      ],
    }),
  ],
});
