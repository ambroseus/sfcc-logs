'use strict';

module.exports = {
	html: asHtml,
	json: asJson
}

function asJson(obj) {
	return JSON.stringify(obj, null, 2);
}

/*
errors: [
	{
		total: Number
		sites: {
			siteName: Number
		}
		pipes: {
			pipeName: Number
		}
		msg: String
		desc: String
	}
]
*/
function asHtml(errors) {
	const sortDesc = obj => Object.keys(obj)
		.sort( (a,b) => obj[b] - obj[a] )
		.map( key => `<b>${obj[key]}</b> ${key}` )
		.join('<br/>');

	const row = err => `<tr>
		<td><b>${err.total}</b></td>
		<td nowrap>${sortDesc(err.sites)}</td>
		<td nowrap>${sortDesc(err.pipes)}</td>
		<td><b>${err.msg}</b><br/>${err.desc}</td>
	</tr>`;
	
	return `<html>
		<head><style>
			th { 
				text-transform: uppercase;
				text-align: left;
			}
			th, td {
				font-size: 10pt;
				font-family: arial;
				vertical-align: top;
				padding: 10px;
				border-bottom: 1px solid #ddd;
			}
		</style></head>
		<body><table>
			<thead><tr><th>total</th><th>sites</th><th>pipelines</th><th>error</th></tr></thead>
			<tbody>${errors.map(row).join("\n")}</tbody>
		</table></body>
	</html>`;
}


