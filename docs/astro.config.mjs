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
      description:
        'Hop between cloud accounts, roles and regions with one command. Automatic login, no access keys.',
      logo: { src: './src/assets/logo.svg' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/dayepesb/cloudhop' },
        { icon: 'seti:npm', label: 'npm', href: 'https://www.npmjs.com/package/cloudhop' },
      ],
      editLink: { baseUrl: 'https://github.com/dayepesb/cloudhop/edit/main/docs/' },
      lastUpdated: true,
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
      },
      sidebar: [
        {
          label: 'Start here',
          translations: { es: 'Empieza aquí' },
          items: [{ slug: 'getting-started' }, { slug: 'concepts' }],
        },
        {
          label: 'Every day',
          translations: { es: 'En el día a día' },
          items: [
            { slug: 'guides/shell' },
            { slug: 'guides/hop-like-aws' },
            { slug: 'guides/console' },
            { slug: 'guides/production' },
            { slug: 'guides/many-accounts' },
            { slug: 'guides/other-tools' },
          ],
        },
        {
          label: 'Accounts and aliases',
          translations: { es: 'Cuentas y alias' },
          items: [
            { slug: 'guides/aws-sso' },
            { slug: 'guides/personal-accounts' },
            { slug: 'guides/aliases-and-regions' },
            { slug: 'guides/team' },
            { slug: 'guides/web-ui' },
          ],
        },
        {
          label: 'AI and automation',
          translations: { es: 'IA y automatización' },
          items: [{ slug: 'guides/ai-assistants' }, { slug: 'guides/scripting' }],
        },
        {
          label: 'Reference',
          translations: { es: 'Referencia' },
          items: [
            { slug: 'reference/commands' },
            { slug: 'reference/files' },
            { slug: 'reference/security' },
            { slug: 'reference/troubleshooting' },
          ],
        },
        {
          label: 'Project',
          translations: { es: 'Proyecto' },
          collapsed: true,
          items: [{ slug: 'project/architecture' }, { slug: 'project/contributing' }],
        },
      ],
    }),
  ],
});
