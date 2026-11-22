#!/usr/bin/env bash
# Crea o actualiza los recursos de Plató en Azure y escribe config/local.json para la app.
#
# Variables opcionales:
#   PLATO_RESOURCE_GROUP   grupo de recursos (rg-plato-dev)
#   PLATO_LOCATION         región (swedencentral)
#   PLATO_STT_ACCOUNT      recurso de Foundry con un despliegue de MAI-Transcribe-2-Streaming ya creado
#   PLATO_STT_DEPLOYMENT   nombre de ese despliegue (mai-transcribe-2-streaming)
set -euo pipefail
cd "$(dirname "$0")/.."

RG="${PLATO_RESOURCE_GROUP:-rg-plato-dev}"
LOCATION="${PLATO_LOCATION:-swedencentral}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }

say "Cuenta de Azure: $(az account show --query user.name -o tsv) · suscripción $(az account show --query name -o tsv)"
PRINCIPAL_ID="$(az ad signed-in-user show --query id -o tsv)"

say "Grupo de recursos $RG en $LOCATION"
az group create -n "$RG" -l "$LOCATION" --tags project=plato created-by=copilot -o none

say "Desplegando infra/main.bicep (Foundry + modelos), suele tardar 5-10 minutos"
OUT="$(az deployment group create -g "$RG" -n plato-infra -f infra/main.bicep \
  -p principalId="$PRINCIPAL_ID" location="$LOCATION" --query properties.outputs -o json)"

endpoint_of() { # cuenta -> https://<subdominio>.services.ai.azure.com
  local sub
  sub="$(az cognitiveservices account list --query "[?name=='$1'].properties.customSubDomainName | [0]" -o tsv)"
  [ -n "$sub" ] && echo "https://$sub.services.ai.azure.com"
}

grant_user() { # da Cognitive Services User sobre una cuenta reutilizada, si aún no lo tiene
  local id
  id="$(az cognitiveservices account list --query "[?name=='$1'].id | [0]" -o tsv)"
  [ -z "$id" ] && return 0
  if [ -z "$(az role assignment list --assignee "$PRINCIPAL_ID" --scope "$id" --role 'Cognitive Services User' --query '[0].id' -o tsv)" ]; then
    az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type User \
      --role 'Cognitive Services User' --scope "$id" -o none
    say "Rol Cognitive Services User concedido en $1"
  fi
}

STT_ENDPOINT=""
if [ -n "${PLATO_STT_ACCOUNT:-}" ]; then STT_ENDPOINT="$(endpoint_of "$PLATO_STT_ACCOUNT")"; grant_user "$PLATO_STT_ACCOUNT"; fi

mkdir -p config
jq -n --argjson o "$OUT" --arg rg "$RG" --arg loc "$LOCATION" \
  --arg stt "$STT_ENDPOINT" --arg sttDep "${PLATO_STT_DEPLOYMENT:-mai-transcribe-2-streaming}" '{
    resourceGroup: $rg,
    location: $loc,
    account: $o.accountName.value,
    endpoint: $o.endpoint.value,
    cognitiveEndpoint: $o.cognitiveEndpoint.value,
    openaiEndpoint: $o.openaiEndpoint.value,
    deployments: $o.deployments.value,
    stt: (if $stt == "" then null else { endpoint: $stt, deployment: $sttDep } end)
  }' > config/local.json

say "Listo. Configuración en config/local.json:"
cat config/local.json
