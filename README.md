# Coop Nico — Snack de caserne

Application web de gestion d'un snack (point de vente) :

- **Vente** : grille d'articles, panier, validation → décrémente le stock et enregistre la transaction.
- **Admin** : gestion des articles, catégories, comptes, et rapports de ventes (export PDF).
- **Auth** : 2 rôles (`admin`, `seller`), uniquement les comptes créés par un admin peuvent se connecter.
- **Hébergement** : 100 % gratuit (GitHub Pages + Supabase free tier).
- **Paiements** : aucun (espèces uniquement).

## Stack

| Couche       | Outil                                               |
|--------------|-----------------------------------------------------|
| Frontend     | Vite + React + TypeScript + TailwindCSS             |
| Hosting      | GitHub Pages (déploiement auto via GitHub Actions)  |
| Backend      | Supabase (Postgres + Auth + Storage + Edge Function)|
| PDF          | jspdf + jspdf-autotable                             |
| Data fetching| TanStack Query                                      |
| State panier | Zustand (persistant en localStorage)                |

## Mise en route

### 1. Setup Supabase

1. Crée un compte sur [supabase.com](https://supabase.com) (gratuit, sans CB).
2. Crée un nouveau projet → récupère :
   - `Project URL` → ce sera `VITE_SUPABASE_URL`
   - `anon public key` → ce sera `VITE_SUPABASE_ANON_KEY`
   - `service_role key` (secrète, pour l'edge function plus tard)
3. Va dans **SQL Editor** → colle le contenu de `supabase/migrations/0001_init.sql` et exécute. Ça crée les tables, les politiques RLS, la RPC `checkout()` et le bucket Storage.
4. Si la création du bucket a échoué, va dans **Storage** → "New bucket" → nom `product-images`, "Public bucket" coché.

### 2. Déployer l'edge function `create-user`

L'admin crée les comptes via une edge function (qui utilise la `service_role` key côté serveur, jamais exposée).

```bash
# Installer la CLI une fois
brew install supabase/tap/supabase  # macOS

# Se connecter et lier le projet
supabase login
supabase link --project-ref <ton-project-ref>

# Déployer la fonction (no-verify-jwt : on vérifie le JWT manuellement
# pour pouvoir lire le profil et son rôle)
supabase functions deploy create-user --no-verify-jwt
```

Pas besoin de définir manuellement `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` : ils sont injectés automatiquement par Supabase dans l'environnement des edge functions.

### 3. Créer le premier admin

1. Dashboard Supabase → **Authentication** → "Add user" → "Create new user" → entre l'email + mot de passe initial → coche "Auto Confirm User".
2. Récupère l'`id` du user créé (colonne `id` dans la table `auth.users`).
3. Dans **SQL Editor** :
   ```sql
   insert into public.profiles (id, role, display_name, active)
   values ('<uuid-du-user>', 'admin', 'Mon Beau-Frère', true);
   ```

### 4. Lancer en local

```bash
cp .env.example .env   # puis remplis VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Va sur [http://localhost:5173/coop-nico/](http://localhost:5173/coop-nico/) (le `base` est paramétré pour GitHub Pages, donc en local le path inclut `/coop-nico/`).

### 5. Déploiement sur GitHub Pages

1. Crée un repo GitHub `coop-nico` et pousse le code sur `main`.
2. **Settings → Pages** → "Source" : sélectionne **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**, ajoute :
   - `VITE_SUPABASE_URL` = l'URL Supabase
   - `VITE_SUPABASE_ANON_KEY` = la clé `anon` (publique, pas grave)
4. Pousse un commit → le workflow `.github/workflows/deploy.yml` build et déploie automatiquement.

Le site sera accessible sur `https://<ton-user>.github.io/coop-nico/`.

> **Note sur la clé `anon`** : elle est publique par design. La sécurité est assurée par les politiques RLS Postgres (les comptes désactivés ou sans profil ne peuvent rien faire).

## Architecture

```
src/
├── lib/
│   ├── supabase.ts        # Client Supabase
│   ├── auth.tsx           # AuthProvider, useAuth, signin/signout
│   ├── database.types.ts  # Types des tables
│   ├── format.ts          # Formatage prix/dates
│   └── pdf.ts             # Génération PDF (jspdf)
├── components/
│   ├── Layout.tsx         # Header + nav
│   ├── ProtectedRoute.tsx # Guard auth + rôle
│   ├── Modal.tsx
│   └── Toast.tsx
├── hooks/
│   ├── useProducts.ts     # Fetch produits + catégories (React Query)
│   ├── useCart.ts         # Panier (Zustand persisté)
│   └── useCheckout.ts     # Mutation RPC checkout()
└── pages/
    ├── Login.tsx
    ├── Sale.tsx           # Page principale (vente)
    └── admin/
        ├── Products.tsx
        ├── Categories.tsx
        ├── Users.tsx
        └── Sales.tsx      # Rapports + PDF

supabase/
├── migrations/0001_init.sql
└── functions/create-user/index.ts
```

## Sécurité

- Toutes les tables ont **Row Level Security** activé.
- Un user authentifié peut lire les articles/transactions et créer une transaction (vente). Seul un admin peut modifier les produits, catégories, comptes.
- La RPC `checkout()` s'exécute en `security definer` et garantit l'atomicité du décrément de stock + création de la transaction (lock par `FOR UPDATE`).
- L'edge function `create-user` vérifie le rôle admin de l'appelant avant d'utiliser la `service_role` key.
- Les prix sont stockés en **centimes** (entiers) pour éviter les bugs de précision.
- Les noms et prix des articles sont **snapshotés** dans `transaction_items` pour préserver l'historique même si on renomme/reprice un article.

## Roadmap possible

- Mode hors-ligne (PWA + sync à la reconnexion)
- Annulation/correction de transactions
- Cron de backup automatique
- Dark mode
