# SpedirePro puntos + Google Maps — V1.4.16

La integración usa Google Maps sólo como vista visual. Los puntos reales vienen de SpedirePro usando `/v1/drop-off-points`.

## Endpoint interno

```text
POST /api/spedirepro/drop-off-points
```

Body ejemplo:

```json
{
  "country": "IT",
  "city": "Milano",
  "postcode": "20121",
  "direction": "sender",
  "vendors": ["ups"],
  "sender_country": "IT"
}
```

Para destino se usa:

```json
{
  "direction": "receiver"
}
```

## Reglas UI

- No se muestran errores técnicos.
- Si no hay puntos, el cliente ve: “No hay puntos disponibles cerca de esta ubicación.”
- Si el servicio requiere punto y no fue elegido, el cliente ve: “Selecciona un punto para continuar.”
- Google Maps no inventa puntos, sólo dibuja los marcadores devueltos por SpedirePro.

## Creación de etiqueta

Si el cliente eligió punto de origen:

```json
{
  "services": {
    "drops": {
      "sender": { "PointID": "..." }
    }
  }
}
```

Si eligió punto de destino:

```json
{
  "services": {
    "drops": {
      "receiver": { "PointID": "..." }
    }
  }
}
```

El punto se pasa sin remapear campos.
