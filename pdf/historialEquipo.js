// -----------------------------------------------------
// historialEquipo.js
// Controlador principal para generar PDF
// -----------------------------------------------------

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

import { obtenerDatosEquipo } from "./historialConsultas.js";
import { generarHTML } from "./historialHTML.js";

// -----------------------------------------------------

async function generarPDF(req, res) {

    let browser = null;

    try {

        const { serie } = req.params;

        // ----------------------------------------
        // Obtener datos del equipo
        // ----------------------------------------

        const datos = await obtenerDatosEquipo(serie);

        // ----------------------------------------
        // Generar HTML
        // ----------------------------------------

        const html = await generarHTML(datos);

        // ----------------------------------------
        // Lanzar Chromium
        // ----------------------------------------

        browser = await puppeteer.launch({

            executablePath: await chromium.executablePath(),

            headless: chromium.headless,

            args: chromium.args,

            defaultViewport: chromium.defaultViewport

        });

        const page = await browser.newPage();

        await page.setViewport({

            width: 1240,

            height: 1754

        });

        await page.setContent(html, {

            waitUntil: "networkidle0"

        });

        await page.emulateMediaType("screen");

        // ----------------------------------------
        // Generar PDF
        // ----------------------------------------

        const pdf = await page.pdf({

            format: "A4",

            printBackground: true,

            preferCSSPageSize: true,

            displayHeaderFooter: false,

            margin: {

                top: "12mm",

                bottom: "12mm",

                left: "12mm",

                right: "12mm"

            }

        });

        // ----------------------------------------
        // Cerrar navegador
        // ----------------------------------------

        await browser.close();

        browser = null;

        // ----------------------------------------
        // Enviar PDF
        // ----------------------------------------

        res.setHeader(

            "Content-Type",

            "application/pdf"

        );

        res.setHeader(

            "Content-Disposition",

            `inline; filename="Historial_${serie}.pdf"`

        );

        res.end(pdf);

    }

    catch (error) {

        console.error(

            "Error generando PDF:",

            error

        );

        if (browser) {

            try {

                await browser.close();

            }

            catch {}

        }

        res.status(500).json({

            error: error.message

        });

    }

}

// -----------------------------------------------------

export default generarPDF;
