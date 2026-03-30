# NEXUS AI PLATFORM — Guide de Déploiement
## TANGER NEXUS EXPO & SUMMIT 2026 | Prime Synergy Group

---

## Architecture Cible

```
Internet
    │
    ▼
Traefik (SSL / reverse proxy)
    ├── platform.primesynergy.ma → Nexus Platform (port 3000)
    └── n8n.primesynergy.ma      → n8n Automation (port 5678)
            │
            ▼
    PostgreSQL (port 5432)
```

---

## 1. Déploiement sur Hostinger VPS

### Prérequis
- VPS Hostinger Ubuntu 22.04
- Docker + Docker Compose installés
- Domaine `primesynergy.ma` avec DNS configuré

### Étapes

```bash
# 1. Se connecter au VPS
ssh root@votre-ip-hostinger

# 2. Installer Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# 3. Cloner le projet
git clone https://github.com/tprimesynergy-crypto/nexus-ai-platform.git
cd nexus-ai-platform

# 4. Configurer l'environnement
cp .env.example .env
nano .env  # Remplir toutes les valeurs

# 5. Créer la base de données
docker compose up postgres -d
sleep 10
docker compose exec postgres psql -U nexus_user -d tanger_nexus -f /init-db.sql

# 6. Démarrer tous les services
docker compose up -d

# 7. Vérifier
docker compose ps
curl https://platform.primesynergy.ma/api/status
```

---

## 2. DNS Hostinger à Configurer

Dans le panneau Hostinger > Domaines > primesynergy.ma > DNS :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | platform | VOTRE_IP_VPS | 300 |
| A | n8n | VOTRE_IP_VPS | 300 |
| A | @ | VOTRE_IP_VPS | 300 |

---

## 3. Importer les Workflows n8n

1. Ouvrir `https://n8n.primesynergy.ma`
2. Menu → Workflows → Import
3. Importer chaque fichier du dossier `N8N_WORKFLOWS/` :
   - `WF-01-intake.json` → Agent Qualification
   - `WF-02-context.json` → Brief Événement
   - `WF-03-research.json` → Research Claude AI
   - `WF-04-email.json` → Email Brevo
   - `WF-05-newsletter.json` → Newsletter Auto
   - `WF-06-social.json` → Social Media
   - `WF-07-veille.json` → Veille Stratégique
   - `WF-08-meeting.json` → Meeting Prep
   - `WF-09-pipeline.json` → Pipeline Scoring
   - `WF-10-dashboard.json` → Rapport Hebdo
   - `WF-11-archive.json` → Export & Backup
   - `WF-12-gate.json` → Gate Approbation

4. Pour chaque workflow :
   - Configurer les credentials PostgreSQL (nom: "Nexus PostgreSQL")
   - Activer le workflow (toggle ON)
   - Copier l'URL du webhook dans `.env`

---

## 4. Configuration n8n Credentials

Dans n8n → Settings → Credentials → New :

**PostgreSQL:**
```
Host: localhost (ou postgres si Docker)
Port: 5432
Database: tanger_nexus
User: nexus_user
Password: [votre mot de passe]
```

**HTTP Header Auth (Anthropic):**
```
Header Name: x-api-key
Header Value: sk-ant-VOTRE_CLE
```

---

## 5. Premier Lancement

```bash
# Tester la plateforme
curl http://localhost:3000/api/status

# Tester un agent en mode démo (sans n8n configuré)
curl -X POST http://localhost:3000/api/workflows/trigger/WF-01 \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Attijariwafa Bank","sector":"Finance","offer_type":"Sponsor Platine"}'

# Ajouter un target
curl -X POST http://localhost:3000/api/targets \
  -H "Content-Type: application/json" \
  -d '{"company_name":"OCP Group","sector":"Industrie","contact_name":"DRH","offer_type":"Sponsor Or"}'
```

---

## 6. URLs de la Plateforme

| Service | URL | Usage |
|---------|-----|-------|
| Dashboard | https://platform.primesynergy.ma | Interface principale |
| API Status | https://platform.primesynergy.ma/api/status | Santé système |
| n8n | https://n8n.primesynergy.ma | Gestion workflows |
| WebSocket | wss://platform.primesynergy.ma/ws | Temps réel |

---

## 7. Objectifs TANGER NEXUS 2026

| KPI | Objectif | Échéance |
|-----|---------|---------|
| Cibles identifiées | 500 entreprises | Mai 2026 |
| Fiches recherche | 300 fiches | Juin 2026 |
| Emails envoyés | 250 emails | Juillet 2026 |
| RDV obtenus | 50 réunions | Août 2026 |
| Sponsors confirmés | 15 sponsors | Septembre 2026 |
| Exposants confirmés | 80 exposants | Octobre 2026 |
| **Revenus** | **2.5M MAD** | **21 oct. 2026** |

---

## Contact Technique
- Email: t.primesynergy@gmail.com
- GitHub: https://github.com/tprimesynergy-crypto/nexus-ai-platform
