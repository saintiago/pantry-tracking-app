import DialogShell from '../../components/DialogShell/DialogShell';
import React, { useEffect, useState } from 'react';
import type { Cookbook } from '@pantry/domain';
import type { Recipe } from '../../api/recipes/recipes';
import { fetchCookbooks, saveCookbook, deleteCookbook } from '../../api/recipes/cookbooks';
import RecipePhoto from '../../components/RecipePhoto/RecipePhoto';
import RecipePhotoField from '../../components/RecipePhoto/RecipePhotoField';
import { t, message, useLanguage } from '../../i18n/i18n';
const button: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
};
export default function Cookbooks({
  recipes,
  onSelect,
}: {
  recipes: Recipe[];
  onSelect: (ids: string[] | null | undefined) => void;
}) {
  useLanguage();
  const [books, setBooks] = useState<Cookbook[]>([]);
  const [selected, setSelected] = useState('all');
  const [draft, setDraft] = useState<Partial<Cookbook> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [remove, setRemove] = useState<Cookbook | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchCookbooks(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setBooks(result);
        setError('');
        if (result.length) {
          setSelected('');
          onSelect(undefined);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Could not load cookbooks. Try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  function select(id: string, current = books) {
    setSelected(id);
    onSelect(
      id === 'all' ? null : id ? current.find((b) => b.cookbookId === id)?.recipeIds : undefined,
    );
  }
  async function save() {
    if (!draft?.name?.trim()) {
      setError('Enter a cookbook name (up to 200 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const book = await saveCookbook({
        ...draft,
        name: draft.name,
        description: draft.description ?? '',
        recipeIds: draft.recipeIds ?? [],
      });
      const next = [...books.filter((b) => b.cookbookId !== book.cookbookId), book];
      setBooks(next);
      setDraft(null);
      select(book.cookbookId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save cookbook. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={t('Cookbooks')} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3>📚 {t('Cookbooks')}</h3>
        <button style={button} aria-pressed={selected === 'all'} onClick={() => select('all')}>
          {t('All recipes')}
        </button>
        <button style={button} aria-pressed={selected === ''} onClick={() => select('')}>
          {t('My cookbooks')}
        </button>
        <button
          style={button}
          disabled={loading || !!error}
          onClick={() => {
            setDraft({ name: '', description: '', recipeIds: [] });
            setError('');
          }}
        >
          {t('New cookbook')}
        </button>
      </div>
      {loading && <p role="status">{t('Loading cookbooks…')}</p>}
      {error && (
        <p role="alert">
          {message(error)}{' '}
          <button
            onClick={() => {
              setError('');
              setAttempt((n) => n + 1);
            }}
            disabled={busy || uploading}
          >
            {t('Reload cookbooks')}
          </button>
        </p>
      )}
      {!draft && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          {books.map((book) => (
            <article
              key={book.cookbookId}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: 12,
                background:
                  selected === book.cookbookId ? 'var(--color-mint)' : 'var(--color-surface)',
                overflowWrap: 'anywhere',
              }}
            >
              <button
                style={{ ...button, width: '100%', textAlign: 'left' }}
                aria-label={t('Open cookbook {0}', book.name)}
                onClick={() => select(book.cookbookId)}
              >
                {book.imageId ? (
                  <RecipePhoto imageId={book.imageId} alt={book.name} />
                ) : (
                  <span aria-hidden="true">📖 </span>
                )}
                <strong>{book.name}</strong>
              </button>
              <p>{book.description}</p>
              <p>
                {t(
                  '{0} recipes',
                  book.recipeIds.filter((id) => recipes.some((r) => r.recipeId === id)).length,
                )}
              </p>
              <button
                style={button}
                aria-label={t('Edit cookbook {0}', book.name)}
                onClick={() => {
                  setDraft(book);
                  setError('');
                }}
              >
                {t('Edit cookbook')}
              </button>
              <button
                style={{ ...button, background: 'var(--color-danger)' }}
                aria-label={t('Remove cookbook {0}', book.name)}
                onClick={() => setRemove(book)}
              >
                ✕
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && !books.length && (
        <p>
          {t(
            'Create a cookbook to organize your recipes. Recipes can belong to more than one cookbook.',
          )}
        </p>
      )}
      {draft && (
        <form
          aria-label={t('Cookbook editor')}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 12 }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
            <label>
              {t('Cookbook name')}
              <input
                required
                maxLength={200}
                value={draft.name ?? ''}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 44 }}
              />
            </label>
            <label>
              {t('Description')}
              <textarea
                maxLength={2000}
                value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <RecipePhotoField
              label={t('Cookbook cover')}
              imageId={draft.imageId}
              onChange={(imageId) => setDraft({ ...draft, imageId: imageId ?? undefined })}
              onBusy={setUploading}
              disabled={busy}
            />
            <fieldset style={{ maxHeight: 300, overflow: 'auto', margin: '12px 0' }}>
              <legend>{t('Recipes in this cookbook')}</legend>
              {recipes.map((recipe) => (
                <label
                  key={recipe.recipeId}
                  style={{ display: 'flex', gap: 8, minHeight: 44, alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={draft.recipeIds?.includes(recipe.recipeId) ?? false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        recipeIds: e.target.checked
                          ? [...(draft.recipeIds ?? []), recipe.recipeId]
                          : (draft.recipeIds ?? []).filter((id) => id !== recipe.recipeId),
                      })
                    }
                  />
                  {recipe.name}
                </label>
              ))}
            </fieldset>
            <button style={button} disabled={uploading}>
              {t(busy ? 'Saving…' : 'Save cookbook')}
            </button>
            <button
              type="button"
              style={button}
              disabled={uploading}
              onClick={() => {
                setDraft(null);
                setError('');
              }}
            >
              {t('Cancel')}
            </button>
          </fieldset>
        </form>
      )}
      {remove && (
        <DialogShell
          label={t('Remove cookbook')}
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <p>{t('Remove {0}? Recipes will stay in your library.', remove.name)}</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await deleteCookbook(remove);
                const next = books.filter((b) => b.cookbookId !== remove.cookbookId);
                setBooks(next);
                setRemove(null);
                select('all', next);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not remove cookbook. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Remove cookbook')}
          </button>
          <button disabled={busy} onClick={() => setRemove(null)}>
            {t('Cancel')}
          </button>
        </DialogShell>
      )}
    </section>
  );
}
