"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const uuid_1 = require("uuid");
const google_auth_library_1 = require("google-auth-library");
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Simulação de banco de dados em memória
const measuresDatabase = {};
// Função para obter medidas por código do cliente e tipo de medição
const getMeasuresByCustomerCode = (customerCode, measureType) => __awaiter(void 0, void 0, void 0, function* () {
    let measures = measuresDatabase[customerCode] || [];
    if (measureType) {
        measureType = measureType.toUpperCase();
        if (measureType !== 'WATER' && measureType !== 'GAS') {
            return {
                error_code: 'INVALID_TYPE',
                error_description: 'Tipo de medição não permitida'
            };
        }
        measures = measures.filter(measure => measure.measure_type.toUpperCase() === measureType);
    }
    if (measures.length === 0) {
        return {
            error_code: 'MEASURES_NOT_FOUND',
            error_description: 'Nenhuma leitura encontrada'
        };
    }
    return measures;
});
// Função para obter o token de autenticação
const getAccessToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const auth = new google_auth_library_1.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/gemini']
    });
    const authClient = yield auth.getClient();
    const accessToken = yield authClient.getAccessToken();
    return accessToken.token;
});
// Endpoint básico para verificar se o servidor está funcionando
app.get('/test', (req, res) => {
    res.send('Endpoint de teste funcionando!');
});
// Endpoint POST /upload
app.post('/upload', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { image, customer_code, measure_datetime, measure_type } = req.body;
    // Validação dos dados fornecidos
    if (!image || typeof image !== 'string' || !customer_code || typeof customer_code !== 'string' || !measure_datetime || !measure_type || (measure_type !== 'WATER' && measure_type !== 'GAS')) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Dados fornecidos no corpo da requisição são inválidos'
        });
    }
    const currentMonth = new Date().toISOString().slice(0, 7);
    const existingMeasures = measuresDatabase[customer_code] || [];
    const isDuplicate = existingMeasures.some(measure => measure.measure_type === measure_type && measure.measure_datetime.startsWith(currentMonth));
    if (isDuplicate) {
        return res.status(409).json({
            error_code: 'DOUBLE_REPORT',
            error_description: 'Leitura do mês já realizada'
        });
    }
    try {
        const token = yield getAccessToken();
        // Chamada à API do Google Gemini
        const geminiResponse = yield axios_1.default.post('https://gemini.googleapis.com/v1/images:process', {
            imageData: image, // Substitua conforme a estrutura correta exigida pela API
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-API-Key': process.env.GOOGLE_API_KEY // Adicione sua chave API aqui
            }
        });
        const image_url = geminiResponse.data.imageUrl; // Ajuste conforme a resposta da API
        const measure_value = geminiResponse.data.measureValue; // Ajuste conforme a resposta da API
        const measure_uuid = (0, uuid_1.v4)(); // UUID gerado
        // Armazenar a nova leitura
        if (!measuresDatabase[customer_code]) {
            measuresDatabase[customer_code] = [];
        }
        measuresDatabase[customer_code].push({
            measure_uuid,
            measure_datetime,
            measure_type,
            has_confirmed: false,
            image_url
        });
        res.status(200).json({
            image_url,
            measure_value,
            measure_uuid
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            error_code: 'INTERNAL_SERVER_ERROR',
            error_description: 'Erro ao processar a imagem'
        });
    }
}));
// Endpoint PATCH /confirm
app.patch('/confirm', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { measure_uuid, confirmed_value } = req.body;
    if (!measure_uuid || typeof confirmed_value !== 'number') {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Dados fornecidos no corpo da requisição são inválidos'
        });
    }
    let measureFound = false;
    for (const measures of Object.values(measuresDatabase)) {
        const measure = measures.find(m => m.measure_uuid === measure_uuid);
        if (measure) {
            if (measure.has_confirmed) {
                return res.status(409).json({
                    error_code: 'CONFIRMATION_DUPLICATE',
                    error_description: 'Leitura já confirmada'
                });
            }
            measure.has_confirmed = true;
            measureFound = true;
            break;
        }
    }
    if (!measureFound) {
        return res.status(404).json({
            error_code: 'MEASURE_NOT_FOUND',
            error_description: 'Leitura não encontrada'
        });
    }
    res.status(200).json({
        success: true
    });
}));
// Endpoint GET /<customerCode>/list
app.get('/:customerCode/list', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { customerCode } = req.params;
    const { measure_type } = req.query;
    const result = yield getMeasuresByCustomerCode(customerCode, measure_type);
    if ('error_code' in result) {
        if (result.error_code === 'INVALID_TYPE') {
            return res.status(400).json(result);
        }
        else if (result.error_code === 'MEASURES_NOT_FOUND') {
            return res.status(404).json(result);
        }
    }
    else {
        return res.status(200).json({
            customer_code: customerCode,
            measures: result
        });
    }
}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
