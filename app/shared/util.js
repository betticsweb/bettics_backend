exports.replaceAll = (str, find, replace) => {
    return str.replace(new RegExp(find, 'g'), replace)
}

exports.reverse = (s) => {
    return s.split("-").reverse().join("-");
}
exports.stringToDate = (_date, _format, _delimiter) => {
    const formatLowerCase = _format.toLowerCase();
    const formatItems = formatLowerCase.split(_delimiter);
    const dateItems = _date.split(_delimiter);
    const monthIndex = formatItems.indexOf("mm");
    const dayIndex = formatItems.indexOf("dd");
    const yearIndex = formatItems.indexOf("yyyy");
    let month = parseInt(dateItems[monthIndex]);
    month -= 1;
    const formatedDate = new Date(Date.UTC(dateItems[yearIndex], month, dateItems[dayIndex], 0, 0, 0, 0));

    return formatedDate;
}