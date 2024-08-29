import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { GoogleAuth } from 'google-auth-library'; 
import axios from 'axios';

dotenv.config();

const app = express();
app.use(express.json());

// Simulação de banco de dados em memória
const measuresDatabase: Record<string, Array<{
    measure_uuid: string;
    measure_datetime: string;
    measure_type: string;
    has_confirmed: boolean;
    image_url: string;
}>> = {};

// Função para obter medidas por código do cliente e tipo de medição
const getMeasuresByCustomerCode = async (customerCode: string, measureType?: string) => {
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
};

// Função para obter o token de autenticação
const getAccessToken = async (): Promise<string> => {
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/gemini']
    });

    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    return accessToken.token!;
};

// Endpoint básico pra conferir se o servidor tá funcionando
app.get('/test', (req: Request, res: Response) => {
    res.send('Endpoint de teste funcionando!');
});

// Endpoint POST /upload
app.post('/upload', async (req: Request, res: Response) => {
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
    const isDuplicate = existingMeasures.some(measure => 
        measure.measure_type === measure_type && measure.measure_datetime.startsWith(currentMonth)
    );

    if (isDuplicate) {
        return res.status(409).json({
            error_code: 'DOUBLE_REPORT',
            error_description: 'Leitura do mês já realizada'
        });
    }

    try {
        const token = await getAccessToken();
        
        // Chamada à API do Google Gemini
        const geminiResponse = await axios.post('https://gemini.googleapis.com/v1/images:process', {
            imageData: image, // Tem que substituir de acordo com a estrutura correta exigida pela API
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-API-Key': process.env.GOOGLE_API_KEY // Adicione sua chave API aqui
            }
        });

        const image_url = geminiResponse.data.imageUrl; // Ajuste conforme a resposta da API
        const measure_value = geminiResponse.data.measureValue; // Ajuste conforme a resposta da API
        const measure_uuid = uuidv4(); // UUID gerado

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

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error_code: 'INTERNAL_SERVER_ERROR',
            error_description: 'Erro ao processar a imagem'
        });
    }
});

// Endpoint PATCH /confirm
app.patch('/confirm', async (req: Request, res: Response) => {
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
});

// Endpoint GET /<customerCode>/list
app.get('/:customerCode/list', async (req: Request, res: Response) => {
    const { customerCode } = req.params;
    const { measure_type } = req.query;

    const result = await getMeasuresByCustomerCode(customerCode, measure_type as string);

    if ('error_code' in result) {
        if (result.error_code === 'INVALID_TYPE') {
            return res.status(400).json(result);
        } else if (result.error_code === 'MEASURES_NOT_FOUND') {
            return res.status(404).json(result);
        }
    } else {
        return res.status(200).json({
            customer_code: customerCode,
            measures: result
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
