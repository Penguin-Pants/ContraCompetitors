import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.ts'],
    rules: {
      // RND-1: L1 never smooths. Only assignments of `false` are allowed.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression[left.property.name='imageSmoothingEnabled'][right.value!=false]",
          message: 'imageSmoothingEnabled must stay false (RND-1).',
        },
      ],
    },
  },
);
