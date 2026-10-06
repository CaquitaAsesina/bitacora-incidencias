/**
 * =====================================================================
 * middlewares/validacion.js — Rechazo centralizado de validaciones
 * =====================================================================
 * express-validator NO rechaza nada por sí solo: sus cadenas solo acumulan
 * errores en `req`. Si una ruta declara validadores pero el controller nunca
 * consulta el resultado, la petición inválida llega hasta el servicio.
 *
 * Este middleware cierra ese hueco: se coloca al final de la cadena de la
 * ruta, después de los validadores y antes del controller, y corta la
 * petición con 400 si hay errores.
 *
 * Uso en una ruta:
 *   router.post(
 *     '/',
 *     requireAuth,
 *     requirePermission('CREAR_USUARIOS'),
 *     usuarioCrearValidation,
 *     checkValidation,   // <-- sin esto los validadores no surtirían efecto
 *     crear
 *   );
 *
 * Respuesta (idéntica a la que ya devolvía incidenciasController a mano):
 *   400 { ok: false, errors: [ { msg, param, ... } ] }
 * =====================================================================
 */
import { validationResult } from 'express-validator';

/**
 * Corta la petición con 400 si los validadores de la ruta produjeron errores.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function checkValidation(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) return next();

  return res.status(400).json({
    ok: false,
    mensaje: 'Datos inválidos',
    errors: errors.array(),
  });
}

/**
 * Valida el `:id` de los recursos por id.
 *
 * express-validator v7 ya no trae `checkId()`; `isInt()` sobre un valor de
 * ruta no normaliza ni convierte, así que se usa un middleware propio que
 * devuelve 400 con el mismo formato que checkValidation.
 *
 * Pensado para un id AUTO_INCREMENT: 1..4294967295 (MySQL INT UNSIGNED).
 * @param {string} nombre  nombre del parámetro de ruta (por defecto 'id')
 */
export function idNumerico(nombre = 'id') {
  return (req, res, next) => {
    const valor = req.params[nombre];

    // "1" y " 1" son válidos; "1abc", "1.5", "-1", "1e3" no.
    if (!/^\d+$/.test(String(valor ?? '').trim())) {
      return res.status(400).json({
        ok: false,
        mensaje: `El parámetro ${nombre} debe ser un entero positivo`,
        errors: [{ msg: `Invalid value for ${nombre}`, param: nombre, value: valor }],
      });
    }

    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 4294967295) {
      return res.status(400).json({
        ok: false,
        mensaje: `El parámetro ${nombre} está fuera de rango`,
        errors: [{ msg: `Out of range value for ${nombre}`, param: nombre, value: valor }],
      });
    }

    req.params[nombre] = String(id);
    return next();
  };
}

/**
 * Ids de las rutas de permisos personalizados por par usuario-rol.
 *
 * Son dos listas distintas a propósito: reutilizar la de tres ids en la ruta
 * POST (que no tiene `:pid`) hace que `req.params.pid` sea `undefined` y el
 * validador rechace con 400 una petición perfectamente válida.
 */
export const idsParUsuarioRol = [idNumerico('uid'), idNumerico('rid')];

/** Los tres ids de DELETE /usuarios/:uid/roles/:rid/permisos/:pid. */
export const idsPersonalizados = [...idsParUsuarioRol, idNumerico('pid')];